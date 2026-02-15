# AI with “Terminal” Access & Running Paper Code – Design

## Goal

You want the AI to:
1. **Look at the paper** (content, code snippets).
2. **Run code as if it has access to a terminal** (e.g. run code from the paper, or clone + run a repo).
3. **Use that to spin up runnable code** from the paper when possible.

This is **possible and not too ambitious** if you scope it to a sandbox and clear tools.

---

## Two Ways to Give the AI “Terminal-Like” Power

### Option A: Snippet execution (“run this code”)

- **Tool:** `execute_code(language, code)` or `run_code(lang, code)`.
- **Backend:** Runs the code in a **sandbox** (no persistent filesystem, short timeout, no network or restricted).
- **Returns:** stdout, stderr, exit code (and maybe a small artifact URL if you allow file output).
- **Flow:** AI reads the paper (or you pass it code blocks); AI extracts or constructs a snippet and calls `execute_code("python", "print(1+1)")`; AI sees the result and can say “the code from the paper runs and prints …” or debug.

**Pros:** Simple, safe, works for small runnable snippets in the paper.  
**Cons:** No multi-step shell, no `git clone`; for full repos you need Option B.

### Option B: Run a repo (clone + install + run)

- **Tool:** `deploy_paper_demo(paper_id | repo_url, run_command?)` (as in your Modal doc).
- **Backend:** Resolves paper → repo URL, then triggers a **background instance** (e.g. Modal) that clones the repo, installs deps, runs a command (or detects Gradio/Streamlit), and returns a **demo URL** or logs.
- **Flow:** AI “looks at” the paper (or library metadata) to get the repo link (or you resolve it via Papers with Code / stored `code_url`); AI calls `deploy_paper_demo(paper_id="2601.12345")`; backend spins up the instance and returns the link; AI tells the user “Demo is running at …”.

**Pros:** Handles full projects, matches your existing “get paper code running” idea.  
**Cons:** Heavier (Modal/similar), not every paper has runnable code.

You can do **both**: Option A for quick snippet runs, Option B for “run the full demo.”

---

## “Simulated Instance in the Background”

That phrase can mean:

1. **Ephemeral run per tool call**  
   Each time the AI calls `execute_code` or `deploy_paper_demo`, you start a **fresh** sandbox/container, run the command, return the result, then tear it down. No long-lived “one terminal per user.” Easiest and safest.

2. **One long-lived sandbox per session**  
   You keep a container (or Modal app) alive for the session; the AI sends multiple commands (e.g. `cd repo && pip install -r requirements.txt && python main.py`). More “terminal-like” but harder (state, security, cost). Usually not needed for “run the paper’s code once.”

Recommendation: start with **ephemeral** (1). If you later want a persistent “notebook” per user, you can add a separate “session sandbox” with strict limits.

---

## How the AI “Looks at” the Paper

- **Library + abstract:** You already inject library papers (title, abstract) into the agent context. So the AI “sees” the paper’s abstract and metadata.
- **Code in the paper:**  
  - If you store **full-text** (or extracted code blocks) per paper, you can add that to the context for “library Q&A” or pass it when the user asks to run code from paper X.  
  - Or the AI gets the **repo URL** from the abstract / Papers with Code and only uses Option B (deploy repo), without needing to see raw code.
- **Tool to get paper content:** Optional tool `get_paper_content(paper_id)` that returns abstract + code blocks (if you have them). The AI calls it when the user says “run the code from this paper” so it has the snippet to pass to `execute_code` (Option A).

So: **yes, the AI can “look at” the paper** via (1) existing library context, (2) optional full-text/code in context, or (3) a `get_paper_content` tool.

---

## Minimal Path to a Demo

### Step 1: Code execution sandbox (Option A)

- **Backend:** One API route, e.g. `POST /api/run-code` with `{ "language": "python", "code": "print(1+1)" }`.
- **Runner:** Use a **hosted code-execution** service so you don’t manage containers yourself, e.g.:
  - **Piston** (public API): `https://emkc.org/api/v2/piston/execute` – you POST language + code, get stdout/stderr. Free tier, no auth by default.
  - Or run **Modal** (or Docker) yourself: one function that executes the code in a minimal image and returns stdout/stderr (and optionally a small file).
- **Security:** Timeout (e.g. 5–10 s), no network or allowlist, limit stdin. Don’t let the AI pass arbitrary shell commands; only `execute_code(lang, code)` with a fixed set of languages (e.g. python, bash if you allow it).
- **Agent tool:** In Kibana (or Claude): tool `run_code` that calls `POST /api/run-code`. Description: “Run a snippet of code (e.g. from a paper) and get stdout/stderr. Use when the user asks to run or test code from a paper.”

Then: user says “the paper has this code: … can you run it?”; AI calls `run_code("python", "…")` and reports the result. That’s a **simulated instance** in the sense: one short-lived run, AI sees the output.

### Step 2: Paper → code for Option A

- If the paper’s code is **in the text**: store code blocks when you ingest full text (or extract from PDF); expose them in library context or via `get_paper_content(paper_id)`. AI can then pass that to `run_code`.
- If the paper only has a **GitHub link**: Option A can’t run the whole repo; use Option B (Modal) for that.

### Step 3: “Spin up the paper’s code” (Option B)

- Implement as in your **modal-demo-feature.md**: `POST /api/deploy-demo` with `paper_id` or `repo_url`, resolve to repo, trigger Modal (or similar) to clone + install + run, return demo URL.
- Agent tool: `deploy_paper_demo(paper_id)` or `deploy_paper_demo(repo_url=...)`. AI “looks at” the paper (abstract / code_url) to know what to run; user says “can you get this paper’s code running?” and the AI calls the tool and returns the link.

---

## Summary

| Question | Answer |
|----------|--------|
| **Is it possible?** | Yes. |
| **Is it too ambitious?** | No, if you start with (1) snippet execution (Option A) and optionally (2) deploy repo (Option B). |
| **Simulated instance?** | Ephemeral sandbox per `execute_code` or per `deploy_paper_demo` call. No need for a long-lived terminal at first. |
| **AI “looking at” the paper** | Already have abstract in context; add code blocks or `get_paper_content` if you want the AI to run snippets from the paper text. |
| **First thing to build** | `POST /api/run-code` + Piston (or Modal) runner + one agent tool `run_code`. Then add `deploy_paper_demo` when you’re ready for full repos. |

If you want, next step can be a concrete **API route + Piston call** and the exact **agent tool payload** so the AI can “run code as if it has a terminal” for snippets, then we layer on the Modal “spin up repo” flow.
