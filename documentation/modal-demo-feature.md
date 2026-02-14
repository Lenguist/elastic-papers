# Get Paper Code Running on Modal – Approach

## Goal

User says: *"Can you get paper A's code running for a demo?"*  
→ System finds the paper’s code (e.g. GitHub), spins up a Modal instance, runs it, and returns a demo URL or status.

---

## High-Level Flow

```
User: "Get paper X code running for a demo"
    ↓
Agent (Kibana) understands intent
    ↓
Agent calls tool: deploy_paper_demo(paper_id | repo_url)
    ↓
Your backend receives request
    ↓
1. Resolve paper → code URL (if needed)
2. Trigger Modal run (clone repo + run in Modal)
3. Return URL / logs / error
    ↓
Agent replies to user with link or error message
```

---

## Option A: Agent Tool + Backend Job (Recommended)

**Idea:** Add a **custom tool** to the Kibana agent. When the user asks to run a paper’s code, the agent calls that tool. Your app provides an API that starts a Modal run and returns a web URL or logs.

### 1. Agent tool (Kibana)

- **Tool name:** e.g. `deploy_paper_demo` or `run_paper_code`
- **Inputs:**  
  - `paper_id` (arXiv ID) **or** `repo_url` (GitHub URL)  
  - Optional: `branch`, `run_command`, `entrypoint`
- **Action:** HTTP POST to your backend, e.g.  
  `POST https://your-app.com/api/deploy-demo`  
  with body `{ "paper_id": "2601.12345" }` or `{ "repo_url": "https://github.com/..." }`.

You configure this tool in Kibana Agent Builder (or equivalent) so the agent can call it when the user asks to “run paper X’s code” or “get paper A’s code running for a demo”.

### 2. Your backend (Next.js API route)

- **Route:** e.g. `app/api/deploy-demo/route.ts`
- **Responsibilities:**
  - Validate `paper_id` or `repo_url`.
  - If only `paper_id`: resolve to a code URL (e.g. from your DB, Papers with Code, or a small mapping).
  - Call a **Modal runner** (see below) and get back:
    - `web_url` (if the Modal app exposes a web endpoint), or
    - `run_id` / `logs_url` / `status`.
  - Return JSON the agent can read and turn into a user-facing message.

So: **no Modal logic in Next.js**; Next.js only orchestrates (resolve paper → call runner → return URL/status).

### 3. Modal runner (Python)

Modal runs Python. So the “runner” is a **small Python service** that:

- Is invoked by your backend (e.g. via HTTP or by enqueueing a job).
- Takes `repo_url`, optional `branch`/`commit`, optional `run_command`.
- Uses Modal’s API/SDK to:
  - Create a run that mounts the repo (e.g. `modal.Mount.from_remote_repo()` or clone in the image).
  - Install deps (e.g. `pip install -r requirements.txt` in the image).
  - Run a given command or a default (e.g. `python main.py` or `python app.py`).
- If the paper’s repo exposes a web app (Gradio, Streamlit, FastAPI), run that and get the public URL Modal provides.
- Return that URL (and maybe run id) to your backend.

You can run this Python service in two ways:

- **A) Same process as your app:** e.g. a tiny Python HTTP server (FastAPI/Flask) that your Next.js route calls.  
- **B) As a Modal function:** a Modal app that has a function `run_repo(repo_url, ...)`. You trigger it from your backend (e.g. via Modal’s REST API or a queue). The function does the clone/install/run and returns the URL.

Both are valid; B is more “everything on Modal”, A is simpler if you already have a Python service.

### 4. Paper → code URL

- **Option 1 – Stored in your app:** When you ingest papers or when the user adds to library, you store an optional `code_url` (e.g. from abstract/PDF or manual entry). Your API looks up by `paper_id` and uses that.
- **Option 2 – Papers with Code API:** Query by arXiv ID to get official code link.  
  e.g. `https://paperswithcode.com/api/v1/papers/{arxiv_id}/repositories`
- **Option 3 – Agent does the lookup:** Agent first uses search/tools to get the paper’s GitHub link, then calls `deploy_paper_demo(repo_url=...)`. Your backend then only needs `repo_url`.

You can combine 1+2 (your DB + PwC as fallback) and let the agent pass either `paper_id` or `repo_url`.

---

## Option B: Agent Returns Instructions, User Clicks “Run on Modal”

Simpler variant:

- Agent’s reply includes a **button** or **link**: “Run this repo on Modal”.
- That link goes to your app with `?repo_url=...` (and optional paper_id).
- Your app shows a “Deploying…” page that calls the same backend (Next.js API → Modal runner) and then shows the demo URL or error.

Same backend as in Option A; only the trigger is “user click” instead of “agent tool call”. You can add the agent tool later and reuse the same API.

---

## What to Build First (Minimal Path)

1. **Paper → code URL**
   - Add optional `code_url` (and maybe `code_github`) to your library paper type and any place you display papers.
   - Implement a simple resolver: given `paper_id`, return `code_url` (from library, or from Papers with Code API, or from agent-provided link).

2. **Modal runner (Python)**
   - One Modal app that:
     - Takes `repo_url`, optional `branch`, optional `run_command`.
     - Image: clone repo, install deps, run command (or detect `app.py` / `main.py` / Gradio/Streamlit).
     - If the run is a web server, use Modal’s `@app.function()` with `web_endpoint` or similar to get a public URL.
     - Return `{ "web_url": "https://...", "run_id": "..." }` or `{ "error": "..." }`.
   - Expose this via a thin HTTP API (or call it from a queue) so Next.js can trigger it.

3. **Next.js API route**
   - `POST /api/deploy-demo`
   - Body: `{ "paper_id": "..." }` or `{ "repo_url": "..." }`.
   - Resolve to `repo_url`, call Modal runner, return JSON (e.g. `{ "url": "...", "message": "..." }`).

4. **Kibana agent tool**
   - Register a tool that calls `POST /api/deploy-demo` with the right payload when the user asks to run a paper’s code.
   - Agent then formats the URL or error into a reply.

5. **UI (optional)**
   - In the Library tab, add “Run demo” per paper when `code_url` is present.
   - Either call the same API and show “Opening demo…” then redirect, or show the link returned by the agent.

---

## Modal Snippets (Conceptual)

```python
# modal_runner.py (simplified)
import modal

app = modal.App("paper-demo-runner")

@app.function(
    image=modal.Image.debian_slim()
        .pip_install("gitpython", "requests")
        # add more as needed
)
def run_repo(repo_url: str, branch: str = "main", run_cmd: str | None = None):
    import subprocess
    # clone repo, pip install -r requirements.txt, run run_cmd or default
    # if Gradio/Streamlit: run and return the URL Modal gives you
    ...
    return {"web_url": "https://...", "run_id": "..."}
```

For a **web demo** (Gradio/Streamlit), you’d typically use Modal’s `@app.function()` with `@modal.web_endpoint()` or run Streamlit/Gradio inside the function and expose that. Modal docs have examples for both.

---

## Security & Limits

- **Quotas / cost:** Limit who can trigger runs (e.g. logged-in user, or only your team) and set max concurrent runs or per-user limits.
- **Repos:** Only allow HTTPS GitHub URLs and optionally restrict to public repos.
- **Sandbox:** Modal runs in its own environment; avoid passing arbitrary shell commands from the user. Prefer fixed patterns (e.g. `python main.py`, `gradio app.py`) or an allowlist.

---

## Summary

| Piece              | Responsibility |
|--------------------|----------------|
| User / Agent       | Ask: “Get paper A code running for a demo.” |
| Agent tool         | Call your API with `paper_id` or `repo_url`. |
| Next.js API        | Resolve paper → repo URL; call Modal runner; return URL/status. |
| Modal (Python)     | Clone repo, install deps, run app, return web URL. |
| UI (optional)      | “Run demo” button in Library; show link from agent. |

If you tell me your preferred stack (e.g. “Python runner as a separate service” vs “Modal function only”), I can outline the exact file layout and step-by-step implementation (e.g. `api/deploy-demo/route.ts`, `modal_runner/app.py`, and agent tool config).
