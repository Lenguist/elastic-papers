"""
Modal deployment agent — spins up a sandbox, clones a GitHub repo,
and uses Claude as a coding agent to get it running.

Deploy:  modal deploy modal_runner/app.py
Serve (dev):  modal serve modal_runner/app.py

The deployed function exposes an HTTPS endpoint that the Next.js app calls.
"""

import modal
import subprocess
import os
import json
import time
import textwrap

# ---------------------------------------------------------------------------
# Modal app & image
# ---------------------------------------------------------------------------

app = modal.App("paper-demo-runner")

# Pre-install common ML/science packages so the agent doesn't pip-install
# from scratch every time.  Keeps runs fast for typical paper repos.
base_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "git", "curl", "wget", "build-essential",
        "ffmpeg", "libsm6", "libxext6", "libgl1",
        "cmake", "pkg-config",
    )
    .pip_install(
        # --- agent driver ---
        "anthropic",
        # --- common ML / data science ---
        "numpy", "pandas", "scipy", "scikit-learn",
        "matplotlib", "seaborn", "pillow",
        # --- deep learning (CPU — keeps image small, agent can install GPU torch if needed) ---
        "torch==2.5.1+cpu", "torchvision==0.20.1+cpu", "torchaudio==2.5.1+cpu",
        extra_options="--extra-index-url https://download.pytorch.org/whl/cpu",
    )
    .pip_install(
        # --- NLP / LLM ---
        "transformers", "datasets", "tokenizers", "accelerate", "sentencepiece",
        # --- web frameworks (for Gradio / Streamlit demos) ---
        "gradio", "fastapi", "uvicorn",
        # --- utilities ---
        "requests", "httpx", "tqdm", "pyyaml", "jsonlines",
        "python-dotenv", "click", "rich",
    )
)

# ---------------------------------------------------------------------------
# Claude coding-agent loop
# ---------------------------------------------------------------------------

AGENT_SYSTEM_PROMPT = textwrap.dedent("""\
    You are a deployment agent.  Your job is to get a GitHub repository
    running inside this container.

    You have ONE tool: execute_command — it runs a shell command and returns
    stdout + stderr.  Use it to explore the repo, read the README, install
    dependencies, and run the code.

    RULES:
    1. Start by listing files (ls) and reading the README (cat README.md or
       similar).
    2. Follow the README's setup instructions.  If there is no README, look
       for setup.py, pyproject.toml, requirements.txt, Makefile, Dockerfile,
       etc. and infer what to do.
    3. When you pip-install, always use --quiet to reduce noise.
    4. If a command fails, read the error carefully, try to fix it (install
       missing packages, downgrade versions, etc.), and retry.  Be
       resourceful — try at most 3 fixes per error before moving on.
    5. If the repo is a web app (Gradio, Streamlit, FastAPI), start it in the
       background (e.g. `nohup python app.py &`) and verify it's listening
       (curl localhost:<port>).  Report the port.
    6. If the repo is a script or notebook, run its main entry point and
       report the output.
    7. If the repo requires a GPU and none is available, try to patch it to
       run on CPU (e.g. device="cpu").  If that's not feasible, say so.
    8. If the repo requires large model downloads (>2 GB), mention it and
       attempt a smaller variant if one exists.
    9. Keep commands short and check results between each step.  Do not chain
       many commands with &&.
    10. When you are DONE — either it's running or you've determined it can't
        run — write a clear summary as your final text response.  Include:
        - Whether it succeeded or failed
        - What the code does
        - The final output or the error you couldn't resolve
        - If it's a web server, the port it's listening on

    CONSTRAINTS:
    - You have no GPU (CPU only).
    - You have internet access.
    - Working directory is the repo root.
    - Timeout per command is 120 seconds.
    - Total budget: 25 steps.  Be efficient.
""")

AGENT_TOOLS = [
    {
        "name": "execute_command",
        "description": (
            "Execute a shell command in the container.  Returns stdout, stderr, "
            "and exit code.  Timeout: 120 s.  Working directory is the repo root "
            "unless you cd elsewhere."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to run.",
                },
            },
            "required": ["command"],
        },
    }
]

# How many agent iterations before we give up
MAX_AGENT_STEPS = 25
# How long a single shell command can run (seconds)
COMMAND_TIMEOUT = 120
# Claude model to use for the sub-agent
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-20250514")


def _run_command(cmd: str, cwd: str) -> dict:
    """Run a shell command and return structured output."""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT,
        )
        stdout = result.stdout
        stderr = result.stderr
        # Truncate very long outputs to stay within Claude's context window
        if len(stdout) > 8000:
            stdout = stdout[:2000] + "\n\n... [truncated middle] ...\n\n" + stdout[-4000:]
        if len(stderr) > 4000:
            stderr = stderr[:1000] + "\n\n... [truncated] ...\n\n" + stderr[-2000:]
        return {
            "exit_code": result.returncode,
            "stdout": stdout,
            "stderr": stderr,
        }
    except subprocess.TimeoutExpired:
        return {
            "exit_code": -1,
            "stdout": "",
            "stderr": f"Command timed out after {COMMAND_TIMEOUT}s",
        }
    except Exception as e:
        return {
            "exit_code": -1,
            "stdout": "",
            "stderr": f"Failed to execute command: {e}",
        }


def run_agent_loop(repo_url: str, repo_dir: str, task: str | None = None) -> dict:
    """
    Run the Claude coding agent loop.
    Returns a dict with status, summary, steps, and output.
    """
    import anthropic

    client = anthropic.Anthropic()  # uses ANTHROPIC_API_KEY env var

    steps: list[dict] = []
    user_task = task or (
        f"Get this repository running: {repo_url}\n"
        "Start by reading the README and understanding what the project does, "
        "then install dependencies and run it."
    )

    messages = [{"role": "user", "content": user_task}]

    for step_num in range(MAX_AGENT_STEPS):
        try:
            response = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=4096,
                system=AGENT_SYSTEM_PROMPT,
                tools=AGENT_TOOLS,
                messages=messages,
            )
        except Exception as e:
            return {
                "status": "error",
                "summary": f"Claude API error: {e}",
                "steps": steps,
                "output": "",
            }

        # Collect assistant response
        messages.append({"role": "assistant", "content": response.content})

        # If the agent is done talking (no tool calls), extract final summary
        if response.stop_reason == "end_turn":
            final_text = "\n".join(
                block.text for block in response.content if hasattr(block, "text")
            )
            return {
                "status": "success",
                "summary": final_text,
                "steps": steps,
                "step_count": step_num + 1,
                "output": steps[-1]["output"] if steps else "",
            }

        # Process tool calls
        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    cmd = block.input.get("command", "")
                    print(f"  [{step_num + 1}/{MAX_AGENT_STEPS}] $ {cmd}")

                    result = _run_command(cmd, repo_dir)
                    output_str = (
                        f"exit_code: {result['exit_code']}\n"
                        f"stdout:\n{result['stdout']}\n"
                        f"stderr:\n{result['stderr']}"
                    )

                    steps.append({
                        "step": step_num + 1,
                        "command": cmd,
                        "exit_code": result["exit_code"],
                        "output": output_str[:3000],  # keep steps compact for response
                    })

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": output_str,
                    })

            messages.append({"role": "user", "content": tool_results})

    # Exhausted all steps
    return {
        "status": "max_steps_reached",
        "summary": (
            f"Agent used all {MAX_AGENT_STEPS} steps without finishing. "
            "The repo may partially work — check the steps for details."
        ),
        "steps": steps,
        "step_count": MAX_AGENT_STEPS,
        "output": steps[-1]["output"] if steps else "",
    }


# ---------------------------------------------------------------------------
# Modal function — exposed as HTTPS endpoint
# ---------------------------------------------------------------------------

@app.function(
    image=base_image,
    timeout=600,           # 10 min max
    memory=4096,           # 4 GB RAM
    secrets=[modal.Secret.from_name("anthropic-key")],
)
@modal.web_endpoint(method="POST")
def deploy_demo(request: dict):
    """
    HTTPS endpoint that clones a repo and runs the Claude deployment agent.

    POST body:
        {
            "repo_url": "https://github.com/user/repo",
            "task": "optional specific instructions"
        }

    Returns:
        {
            "status": "success" | "error" | "max_steps_reached",
            "summary": "human-readable summary from Claude",
            "steps": [ { "step": 1, "command": "...", "exit_code": 0, "output": "..." }, ... ],
            "step_count": 12,
            "repo_url": "https://github.com/user/repo"
        }
    """
    repo_url = request.get("repo_url", "").strip()
    task = request.get("task", "")

    if not repo_url:
        return {"status": "error", "summary": "repo_url is required", "steps": []}

    # Validate URL (basic security check)
    if not repo_url.startswith("https://github.com/"):
        return {
            "status": "error",
            "summary": "Only public GitHub HTTPS URLs are supported.",
            "steps": [],
        }

    repo_dir = "/tmp/repo"

    # Clone the repository
    print(f"Cloning {repo_url} ...")
    clone_result = _run_command(f"git clone --depth 1 {repo_url} {repo_dir}", "/tmp")

    if clone_result["exit_code"] != 0:
        return {
            "status": "error",
            "summary": f"Failed to clone repository: {clone_result['stderr']}",
            "steps": [{"step": 0, "command": f"git clone {repo_url}", "exit_code": clone_result["exit_code"], "output": clone_result["stderr"]}],
        }

    print(f"Cloned successfully.  Running agent loop ...")
    start = time.time()
    result = run_agent_loop(repo_url, repo_dir, task or None)
    elapsed = time.time() - start

    result["repo_url"] = repo_url
    result["elapsed_seconds"] = round(elapsed, 1)
    print(f"Agent finished in {elapsed:.1f}s — status: {result['status']}")
    return result
