"""
Modal sandbox manager — creates persistent sandboxes, execs commands,
and terminates them. The Claude agent loop runs in Next.js; this is
just the infrastructure layer.

Uses a warm pool of pre-created sandboxes so users don't wait for cold starts.

Deploy:  modal deploy modal_runner/app.py
Then warm the pool:  curl -X POST https://YOUR--paper-demo-runner-warm-pool.modal.run
"""

import modal
import json
import os
import time

app = modal.App("paper-demo-runner")

# Light image for the web endpoint functions (needs FastAPI)
function_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]")

# Lightweight sandbox image — just git + basic dev tools.
# The Claude agent installs project-specific packages as needed via pip/npm/etc.
sandbox_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "git", "curl", "wget", "build-essential",
        "file", "vim", "less", "unzip", "jq",
        "pkg-config", "cmake",
    )
    .pip_install("pip", "setuptools", "wheel")
    .run_commands("curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs")
)

SANDBOX_TIMEOUT = 3600   # 1 hour max lifetime
POOL_TARGET = 3          # keep this many warm sandboxes ready

# Distributed dict to persist pool state across function invocations
pool_dict = modal.Dict.from_name("sandbox-pool", create_if_missing=True)


# ─── Pool helpers ─────────────────────────────────────────────────────────────

def _get_pool_ids() -> list:
    """Read the list of pre-warmed sandbox IDs from the distributed dict."""
    try:
        raw = pool_dict.get("ids")
        return json.loads(raw) if raw else []
    except Exception:
        return []


def _set_pool_ids(ids: list):
    """Write the list of sandbox IDs to the distributed dict."""
    pool_dict["ids"] = json.dumps(ids)


def _claim_sandbox():
    """Try to grab a pre-warmed sandbox from the pool. Returns (Sandbox, id) or None."""
    ids = _get_pool_ids()
    while ids:
        sid = ids.pop(0)
        _set_pool_ids(ids)  # save immediately so another request doesn't grab the same one
        try:
            sb = modal.Sandbox.from_id(sid)
            print(f"✅ Claimed pre-warmed sandbox {sid} (pool now {len(ids)})")
            return sb, sid
        except Exception:
            print(f"⚠️  Pool sandbox {sid} expired, skipping")
            continue
    return None


# ─── Replenish pool (background function) ────────────────────────────────────

@app.function(timeout=600, image=function_image)
def replenish_pool():
    """Create sandboxes to fill the pool back up to POOL_TARGET."""
    ids = _get_pool_ids()

    # Prune dead sandboxes
    alive = []
    for sid in ids:
        try:
            modal.Sandbox.from_id(sid)
            alive.append(sid)
        except Exception:
            print(f"  Pruned expired sandbox {sid}")

    needed = max(0, POOL_TARGET - len(alive))
    print(f"Pool status: {len(alive)} alive, need {needed} more")

    for i in range(needed):
        try:
            sb = modal.Sandbox.create(image=sandbox_image, app=app, timeout=SANDBOX_TIMEOUT)
            alive.append(sb.object_id)
            print(f"  Created pool sandbox {i+1}/{needed}: {sb.object_id}")
        except Exception as e:
            print(f"  Failed to create pool sandbox: {e}")

    _set_pool_ids(alive)
    return {"pool_size": len(alive), "created": needed}


# ─── Warm pool endpoint (call after deploy or on-demand) ─────────────────────

@app.function(timeout=600, image=function_image)
@modal.fastapi_endpoint(method="POST")
def warm_pool(request: dict = {}):
    """
    POST /warm_pool — fill the sandbox pool to POOL_TARGET.
    Call this after deploying or anytime you want warm sandboxes ready.
    """
    result = replenish_pool.remote()
    return result


# ─── Pool status endpoint ────────────────────────────────────────────────────

@app.function(timeout=30, image=function_image)
@modal.fastapi_endpoint(method="GET")
def pool_status():
    """GET /pool_status — check how many sandboxes are in the pool."""
    ids = _get_pool_ids()
    alive = 0
    for sid in ids:
        try:
            modal.Sandbox.from_id(sid)
            alive += 1
        except Exception:
            pass
    return {"pool_size": alive, "target": POOL_TARGET, "raw_ids": len(ids)}


# ─── Create sandbox ──────────────────────────────────────────────────────────

@app.function(timeout=300, image=function_image)
@modal.fastapi_endpoint(method="POST")
def create_sandbox(request: dict):
    """
    POST: { "repo_url": "https://github.com/...", "env_vars": { "KEY": "val" } }

    Grabs a pre-warmed sandbox from the pool (fast) or creates one on-demand (slower).
    Then clones the repo and writes env vars into it.
    """
    try:
        repo_url = request.get("repo_url", "").strip()
        env_vars = request.get("env_vars", {})

        if not repo_url:
            return {"error": "repo_url is required"}
        if not repo_url.startswith("https://github.com/"):
            return {"error": "Only public GitHub HTTPS URLs are supported."}

        # 1) Try to claim a pre-warmed sandbox from the pool
        claimed = _claim_sandbox()
        if claimed:
            sb, sandbox_id = claimed
            from_pool = True
        else:
            # Fallback: create on-demand
            print(f"Pool empty — creating sandbox on-demand for {repo_url}...")
            sb = modal.Sandbox.create(
                image=sandbox_image,
                app=app,
                timeout=SANDBOX_TIMEOUT,
            )
            sandbox_id = sb.object_id
            from_pool = False
            print(f"Created on-demand sandbox {sandbox_id}")

        # 2) Trigger async pool replenishment (fire-and-forget)
        try:
            replenish_pool.spawn()
        except Exception:
            pass  # non-critical

        # 3) Clone repo
        p = sb.exec("bash", "-c", f"git clone --depth 1 {repo_url} /root/repo 2>&1")
        clone_output = p.stdout.read()
        try:
            p.wait()
        except Exception:
            pass
        clone_exit = p.returncode

        if clone_exit != 0:
            try:
                sb.terminate()
            except Exception:
                pass
            return {
                "error": f"Failed to clone: {clone_output}",
                "sandbox_id": None,
            }

        # 4) Write env vars if provided
        if env_vars and isinstance(env_vars, dict) and len(env_vars) > 0:
            env_content = "\n".join(f'{k}="{v}"' for k, v in env_vars.items()) + "\n"
            p = sb.exec("bash", "-c", f"cat > /root/repo/.env << 'ENVEOF'\n{env_content}ENVEOF")
            try:
                p.wait()
            except Exception:
                pass
            p = sb.exec("bash", "-c",
                f"find /root/repo -name '.env.sample' -o -name '.env.example' -o -name '.env.template' | "
                f"while read f; do dir=$(dirname \"$f\"); if [ ! -f \"$dir/.env\" ]; then "
                f"cat > \"$dir/.env\" << 'ENVEOF'\n{env_content}ENVEOF\nfi; done"
            )
            try:
                p.wait()
            except Exception:
                pass

        # 5) Get repo structure for context
        p = sb.exec("bash", "-c", "ls -la /root/repo 2>&1 | head -30")
        ls_output = p.stdout.read()
        try:
            p.wait()
        except Exception:
            pass

        source = "pool" if from_pool else "on-demand"
        print(f"Sandbox {sandbox_id} ready ({source}) with repo cloned")

        return {
            "sandbox_id": sandbox_id,
            "repo_url": repo_url,
            "clone_output": clone_output.strip(),
            "ls_output": ls_output.strip(),
            "from_pool": from_pool,
        }
    except Exception as e:
        print(f"create_sandbox error: {e}")
        return {"error": f"Sandbox creation failed: {str(e)}"}


# ─── Execute command in sandbox ──────────────────────────────────────────────

@app.function(timeout=180, image=function_image)
@modal.fastapi_endpoint(method="POST")
def exec_command(request: dict):
    """
    Execute a command in an existing sandbox.

    POST: { "sandbox_id": "sb-...", "command": "ls -la" }
    Returns: { "stdout": "...", "stderr": "...", "exit_code": 0 }
    """
    sandbox_id = request.get("sandbox_id", "")
    command = request.get("command", "")

    if not sandbox_id or not command:
        return {"error": "sandbox_id and command are required"}

    try:
        sb = modal.Sandbox.from_id(sandbox_id)
    except Exception as e:
        return {"error": f"Sandbox not found or terminated: {e}"}

    # Always run from the repo directory
    full_cmd = f"cd /root/repo && {command}"

    try:
        p = sb.exec("bash", "-c", full_cmd, timeout=120)
        stdout = p.stdout.read()
        stderr = p.stderr.read()
        try:
            p.wait()
        except Exception:
            pass
        exit_code = p.returncode

        # Truncate very long outputs
        if len(stdout) > 10000:
            stdout = stdout[:3000] + "\n\n... [truncated middle] ...\n\n" + stdout[-5000:]
        if len(stderr) > 5000:
            stderr = stderr[:1500] + "\n\n... [truncated] ...\n\n" + stderr[-2500:]

        return {
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": exit_code,
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": str(e),
            "exit_code": -1,
        }


# ─── Terminate sandbox ──────────────────────────────────────────────────────

@app.function(timeout=30, image=function_image)
@modal.fastapi_endpoint(method="POST")
def terminate_sandbox(request: dict):
    """
    Terminate a sandbox.

    POST: { "sandbox_id": "sb-..." }
    Returns: { "terminated": true }
    """
    sandbox_id = request.get("sandbox_id", "")
    if not sandbox_id:
        return {"error": "sandbox_id is required"}

    try:
        sb = modal.Sandbox.from_id(sandbox_id)
        sb.terminate()
        print(f"Terminated sandbox {sandbox_id}")
        return {"terminated": True}
    except Exception as e:
        return {"error": f"Failed to terminate: {e}"}
