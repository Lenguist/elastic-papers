# Killer Demo: Search → Compare → Eval on Benchmark → Save to Notes

## Quick: run the test window

In one terminal start the app, in another run the demo script:

```bash
# Terminal 1
npm run dev

# Terminal 2 (from repo root)
chmod +x scripts/demo-flow.sh
./scripts/demo-flow.sh
```

The script hits the APIs that exist (library add/list), checks for Notes and run-benchmark (and tells you to add them if missing), and prints the exact chat prompts for the full demo.

---

## The use case (demo script)

1. **User:** “Search for papers on [topic]” → AI finds papers, user or AI adds some to library.
2. **User:** “Compare the approaches of [Paper A] and [Paper B]” → AI reads abstracts/full text, writes a comparison (approaches, tradeoffs, when to use which).
3. **User:** “Evaluate both approaches on [Paper C]’s benchmark” → AI resolves Paper C to its benchmark/code, spins up a run (e.g. Modal), runs Paper A’s method and Paper B’s method on Paper C’s benchmark (or runs Paper C’s eval script with configs for A and B), collects metrics.
4. **AI:** Saves the comparison + eval results **into Notes** so the user has a single place to read “comparison + benchmark numbers.”

That’s the full loop: search → compare → run evals → persist in notes. Yes, that demo would be killer.

---

## Why it’s hard (and what to build)

- **Search:** You have it (Elastic / arXiv).
- **Compare:** LLM + context (library papers, optional full text). Needs clear prompt and maybe a dedicated “compare” tool or just good context.
- **Eval on third paper’s benchmark:** This is the heavy part. Papers have different codebases, benchmarks, and interfaces. To “evaluate Paper A and Paper B on Paper C’s benchmark” in general you’d need:
  - Paper C’s repo = benchmark harness (run config, dataset, metrics).
  - Paper A and B’s code that can *plug into* that harness (same task, same I/O). Often they don’t; each paper has its own eval script.
- **Practical approach for a demo:** Don’t build a universal “any A, B on any C” system. Pick a **concrete benchmark** (e.g. one paper’s repo that already evaluates multiple methods, like ACE’s AppWorld setup) and implement:
  - “Run [that] benchmark” (clone repo, install, run their eval script).
  - Optionally: “Run with method = A” / “method = B” if that repo supports it, or run two different repos that both implement the same benchmark interface. For a first version, even “run Paper C’s eval and save the output” is enough; then you can add “run for baseline A vs B” when the benchmark supports it.
- **Notes:** Today Notes is “coming soon.” You need: store (e.g. in-memory or DB), API (GET/POST notes), UI (Notes tab shows list/detail), and an agent tool **save_to_notes(content)** so the AI can write the comparison + eval summary.

So the path is: implement Notes + run_benchmark (for at least one concrete benchmark) + agent tools, then script the demo.

---

## How you’d replicate it (full time, phased)

### Phase 1: Notes + “save to notes” tool

**Goal:** AI can persist comparison and eval summary so the user sees it in the app.

- **Backend**
  - Add a notes store (in-memory per session or DB). Same pattern as library: e.g. `lib/notes-store.ts` with `getNotes()`, `addNote(content, title?)`, `resetNotes()` for tests.
  - **GET /api/notes** → list notes (e.g. `{ notes: [ { id, title, content, createdAt } ] }`).
  - **POST /api/notes** → create note (body: `{ title?, content }`).
- **Frontend**
  - Notes tab: replace “Notes feature coming soon” with a list of notes (title + snippet). Click to expand or open a simple detail view. Load from GET /api/notes.
- **Agent**
  - New tool **save_to_notes** that calls POST /api/notes with title + content (e.g. “Comparison: Paper A vs Paper B” and “Eval results on Paper C’s benchmark: …”). Document in your agent-tools doc and add the HTTP tool in Kibana (or Claude) so the agent can call it after comparing and after getting eval output.

**Test:** Send a message like “Save this to my notes: Comparison of X and Y …”; agent calls save_to_notes; you open Notes tab and see the note.

---

### Phase 2: Run benchmark (one concrete benchmark)

**Goal:** “Evaluate [something] on [Paper C]’s benchmark” results in a real run and metrics the AI can read and then save to notes.

- **Pick one benchmark** (e.g. ACE’s repo https://github.com/ace-agent/ace with AppWorld, or another paper that has a single “run eval” script). Understand how to run it (e.g. `python run_appworld.py` or similar), what it needs (env vars, data path), and what it outputs (stdout metrics, JSON file).
- **Backend**
  - **POST /api/run-benchmark** (or extend deploy-demo) with body e.g. `{ "benchmark_paper_id": "2510.04618", "methods": ["ace", "baseline"] }` or, for a first cut, `{ "benchmark_paper_id": "2510.04618" }` and you just run that paper’s default eval script.
  - Your Next.js route: resolve `benchmark_paper_id` to repo URL (Papers with Code, or a small mapping: 2510.04618 → ace-agent/ace). Call a **runner** (Modal or Docker) that:
    - Clones the repo.
    - Installs deps (e.g. `pip install -r requirements.txt`).
    - Runs the eval command (e.g. `python run_eval.py`).
    - Captures stdout + any result JSON/file.
    - Returns `{ success, stdout, stderr, metrics?: {...}, error? }` to the API.
- **Runner (Modal recommended)**
  - One Modal app (or a single long-running “worker”) that accepts (repo_url, run_command, env). It clones, installs, runs, returns logs + artifacts. Your API just calls it (HTTP or Modal client) and returns the result to the caller.
- **Agent**
  - New tool **run_benchmark** (or **evaluate_on_benchmark**) that takes `benchmark_paper_id` and optionally method names. Calls POST /api/run-benchmark. Agent gets back metrics/text and can say “Here are the results …” and then call **save_to_notes** with the eval summary.

**Test:** “Evaluate ACE on its own AppWorld benchmark” (or “run the benchmark for paper 2510.04618”). Agent calls run_benchmark, gets output, then save_to_notes with the results. You see the note in the Notes tab.

---

### Phase 3: Compare two papers (and plug into the flow)

**Goal:** User says “Compare Paper A and Paper B”; AI produces a structured comparison; optionally that comparison is saved to notes before or after eval.

- **Option A (no new backend):** Rely on context. When the user says “Compare [Paper A] and [Paper B],” the agent already has library context (abstracts, titles). You add a sentence in the system/context: “When the user asks to compare two papers, write a clear comparison (approaches, tradeoffs, when to use which) and offer to save it to notes.” The agent answers and can call save_to_notes with the comparison.
- **Option B (dedicated tool):** Tool **compare_papers** with inputs (paper_id_a, paper_id_b). Backend fetches abstracts (and optional full text) for both, returns them; agent gets a blob and writes the comparison, then save_to_notes. Same end result, more structure.

For the killer demo, Option A is enough: good library context + instruction to compare and save.

---

### Phase 4: End-to-end demo script and “eval both on third paper”

**Goal:** One conversation that does: search → compare A vs B → eval both on C’s benchmark → save to notes.

- **Eval “both” on C’s benchmark:** In the generic case, “both approaches” means running two different codebases (A and B) on C’s benchmark. That only works if:
  - C’s benchmark supports “method” or “model” config (e.g. run with method=ACE vs method=GEPA), or
  - A and B both implement the same interface (e.g. same task, same input/output).  
  For a first demo, you can:
  - **Simplified:** “Run Paper C’s benchmark once” and save that to notes (no A vs B yet). Demo = search → compare A vs B (saved to notes) → “Run Paper C’s benchmark and save the results to notes.” Still strong.
  - **Full:** If your chosen benchmark (e.g. ACE) has scripts that run “baseline vs ACE,” then run_benchmark can return both numbers and the agent writes “Approach A: X%, Approach B: Y%” and saves to notes.

- **Orchestration:** Agent has tools: search (existing), add_to_library, save_to_notes, run_benchmark. User flow:
  1. “Search for papers on agentic context engineering.”
  2. “Add [ACE], [GEPA], [Dynamic Cheatsheet] to my library.” (or agent does it)
  3. “Compare ACE and Dynamic Cheatsheet.”
  4. Agent writes comparison, calls save_to_notes(“Comparison: ACE vs DC”, comparison_text).
  5. “Evaluate both on the AppWorld benchmark from the ACE paper.”
  6. Agent calls run_benchmark(benchmark_paper_id="2510.04618") (and if supported, methods = [ACE, DC]); gets metrics; calls save_to_notes(“Eval: AppWorld”, eval_summary).

**Demo script (exact prompts):** Write these down and practice once: e.g. “Search for papers on agentic context engineering” → “Add the ACE paper and the Dynamic Cheatsheet paper to my library” → “Compare the approaches of ACE and Dynamic Cheatsheet” → “Run the ACE paper’s AppWorld benchmark and save the results to my notes.”

---

## Window to run commands and test

Use this as your “window” to run and test each piece.

### 1. Run the app locally

```bash
cd /Users/mbondarenko/Desktop/elastic-papers
npm run dev
```

Open http://localhost:3000 . You should see scope → chat and Library/Notes tabs.

### 2. Test library API (search/add are already there)

```bash
# List library
curl -s http://localhost:3000/api/library | jq .

# Add a paper
curl -s -X POST http://localhost:3000/api/library \
  -H "Content-Type: application/json" \
  -d '{"papers":[{"id":"2510.04618","title":"ACE: Agentic Context Engineering"}]}' | jq .
```

### 3. When Notes API exists (Phase 1)

```bash
# List notes
curl -s http://localhost:3000/api/notes | jq .

# Create a note (after you add POST /api/notes)
curl -s -X POST http://localhost:3000/api/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"Comparison: ACE vs DC","content":"ACE does X. DC does Y. ..."}' | jq .
```

### 4. When run-benchmark exists (Phase 2)

```bash
# Trigger benchmark run (after you add POST /api/run-benchmark and Modal runner)
curl -s -X POST http://localhost:3000/api/run-benchmark \
  -H "Content-Type: application/json" \
  -d '{"benchmark_paper_id":"2510.04618"}' | jq .
```

(Adjust body if you add `methods` or `repo_url`.)

### 5. Test chat → tools (manual simulation)

With the app running and an agent that has the tools:

- In the UI: set scope, then send “Compare ACE and Dynamic Cheatsheet and save the comparison to my notes.”
- Check Notes tab for the new note.
- Then send “Run the ACE paper’s benchmark and save the results to my notes.” Check Notes again.

### 6. Optional: minimal test script

You can add a script that simulates the full flow (library add, notes save, and when available, run-benchmark) so you don’t have to click through every time:

- `scripts/demo-flow.sh` or `scripts/demo-flow.ts` that:
  - POSTs to /api/library to add 2–3 papers,
  - POSTs to /api/notes to create a “comparison” note,
  - (Optional) POSTs to /api/run-benchmark and then POSTs to /api/notes with the result.

Run it with `./scripts/demo-flow.sh` or `npx ts-node scripts/demo-flow.ts` (with the dev server up). That’s your “window” to run the pipeline from the command line.

---

## Summary

| Step in demo        | What to build / use                          | How to test |
|--------------------|----------------------------------------------|-------------|
| Search papers      | Existing (Elastic / chat)                    | Ask in chat |
| Compare two papers | Library context + instruction to compare + save | Ask “Compare A and B”, then check Notes |
| Eval on 3rd benchmark | run_benchmark tool + Modal (or Docker) runner for one benchmark repo | curl POST /api/run-benchmark or ask in chat |
| Save to notes      | Notes store, GET/POST /api/notes, Notes tab UI, save_to_notes tool | curl POST /api/notes; ask agent to save and check Notes tab |

Yes, that demo would be killer. The replication path is: Phase 1 Notes + save_to_notes, Phase 2 one concrete run_benchmark + runner, Phase 3 compare flow, Phase 4 script the exact prompts and practice the run. The “window” to run and test is: `npm run dev` plus the curl commands and optional demo script above.
