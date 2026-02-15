# Current State & Next Steps (Demo + Elastic Backend)

**Last updated:** After adding notes, persistent storage (library + notes), and “chat about selected papers.” Focus: where the demo stands and what’s needed on the **Elastic/backend** side (including speed).

---

## What’s Done

### App & persistence
| Feature | Status | Notes |
|--------|--------|------|
| **Library** | ✅ | Add/remove/approve papers; persisted in **Neon** when `POSTGRES_URL`/`DATABASE_URL` set; in-memory fallback. |
| **Notes** | ✅ | Create/edit/delete; persisted in same Neon DB; **paper-linked notes** (notes under a paper in Library, bundled by paper in Notes tab). |
| **Notes tab** | ✅ | Notion-style: “New note” at top, notes grouped by paper + General, chronological within each. |
| **Library tab** | ✅ | Select all / per-paper checkboxes; **selected papers** drive “focus” for next AI chat. |
| **Chat about selected papers** | ✅ | When you select papers in Library, the next chat request sends `selected_paper_ids`; agent context is **only those papers** (smaller, focused context). |
| **Discovery** | ✅ | `/discovery` – trending papers by category (arXiv API), Add to library. |
| **Save to library (AI)** | ✅ | One-time “Save to library (N papers)” per message; then shows “Saved to library.” |
| **Scope + agent** | ✅ | User sets research scope; chat calls Kibana Agent Builder `converse` with library (or selected) context. |

### Backend (this repo)
- **Neon:** Library + notes tables, schema in `scripts/schema.sql`, optional `scripts/migrate-notes-paper-id.sql` for existing DBs.
- **Chat API:** `POST /api/chat` → builds library (or selected) context, sends to Kibana `POST .../api/agent_builder/converse` with `input` + `agent_id`.
- **No Elasticsearch in this repo:** Search and agent live in **Elastic Cloud / Kibana** (Agent Builder). This app only calls the Kibana API.

### Documentation
- **data-persistence-library-notes.md** – Library + notes persistence, Neon checklist.
- **elastic-agent-add-to-library-tool.md** – How to give the agent add/remove library tools (HTTP tools or workflow).
- **killer-demo-full-implementation-plan.md** – Full demo flow: search → compare → eval on benchmark → save to notes.
- **PLAN.md** – Prize checklist, semantic search (Jina/semantic_text), Agent Builder, Workflows.
- **discovery-page-ideas.md** – Discovery features (trending, categories, Add to library).

---

## Where This Sits vs the “Killer Demo” Plan

From **killer-demo-full-implementation-plan.md**:

| Step | Plan | Current state |
|------|------|----------------|
| **Search papers** | Elastic / chat | ✅ Via Kibana agent (you have it). |
| **Add to library** | User or agent | ✅ UI + API; agent can use HTTP tools (doc’d). |
| **Compare two papers** | Library context + instruction to compare + save | ⚠️ Context is there (library/selected); **agent prompt/tools** need to “compare and optionally save to notes.” |
| **Save to notes** | Notes store + `save_to_notes` agent tool | ✅ Notes API + UI; **agent still needs a `save_to_notes` HTTP tool** so it can write comparison/eval into notes. |
| **Eval on 3rd benchmark** | `run_benchmark` + Modal (or Docker) | ❌ Not built; Phase 2 in the plan. |

So: **persistence and “chat about selected papers” are in place.** To close the loop you still need:
1. **Agent tools:** `save_to_notes` (and optionally `add_to_library` if not already configured).
2. **Elastic/backend:** Faster, more reliable search + agent (see below).
3. **Optional:** `run_benchmark` + runner for the “eval on Paper C’s benchmark” step.

---

## Prize Requirements (Quick Check)

| Requirement | Status | Where |
|-------------|--------|--------|
| Best end-to-end Agentic system | 🔶 In progress | Agent + library + notes + selected-papers context; needs tools + speed. |
| Depth & creativity of ES implementation | 🔶 | Depends on Elastic side: semantic search, Jina, aggregations, etc. |
| Use of JINA for embeddings | ❓ | In **Elastic** (index/ingestion), not in this app. See PLAN.md. |
| Elastic Agent Builder | ✅ | Chat uses Agent Builder `converse` API. |
| Elastic Workflows | ❓ | Could wrap agent + tools in a workflow (doc’d for add/remove library). |
| Elastic Cloud | ✅ | KIBANA_URL + KIBANA_API_KEY point at Elastic Cloud. |

---

## The Slowness Problem: Elastic / Backend

You’re right that **more needs to happen on the Elastic side**; the app is just a client.

- **Where the delay is:**  
  Latency is almost certainly in (1) **Kibana Agent Builder** (model + tools) and/or (2) **Elasticsearch** (e.g. search or retrieval the agent uses). This repo only does a single `POST` to `converse` and waits for the answer.

- **What would help on the Elastic/backend side:**
  1. **Faster search**  
     - Use **semantic search** (e.g. `semantic_text` or kNN with Jina embeddings) so the agent gets better results with fewer queries.  
     - Tune index (size, refresh, replicas) and queries (limit size, avoid heavy aggregations in the hot path).
  2. **Agent configuration**  
     - Give the agent **tools** (e.g. `semantic_search`, `get_paper`, `add_to_library`, `save_to_notes`) so it doesn’t rely on one giant “do everything” step.  
     - Keep prompts and context concise; you’re already helping by sending **only selected papers** when the user has made a selection.
  3. **JINA (prize)**  
     - Use Jina for embeddings in **Elastic**: inference endpoint for `semantic_text` or ingest pipeline that calls Jina and stores vectors. All in Elastic Cloud/Kibana, not in this Next.js app.
  4. **Workflows (optional)**  
     - A workflow that runs “search → agent with tools” can make the pipeline clearer and easier to optimize (caching, timeouts, retries).

**Concrete next steps for “backend / Elastic”:**
- In **Kibana / Elastic Cloud:**  
  - Add or tune **semantic search** (and Jina if available) so the agent’s search step is fast and good.  
  - Expose **agent tools** (e.g. `save_to_notes`, `add_to_library`) and ensure the agent is configured to use them with small, focused context.  
- In **this repo:**  
  - You can add a **Notes API** doc for the agent: `POST /api/notes` with `{ content, paper_id? }` so the agent’s `save_to_notes` tool has a clear spec.  
  - Optional: **streaming** from the chat API (if Kibana supports it) so the UI can show tokens as they arrive and feel faster.

---

## Docs to Update (Stale Bits)

- **killer-demo-full-implementation-plan.md**  
  - Phase 1 (Notes + save_to_notes): **Notes are done** in the app; update to “Add agent tool `save_to_notes` that calls `POST /api/notes`.”
  - Demo script: add a line about “select papers in Library, then ask a follow-up” to show selected-papers context.
- **data-persistence-library-notes.md**  
  - Already states notes use the same DB as library; optional: one sentence that notes can be linked to a paper (`paper_id`).
- **PLAN.md**  
  - “No UI” is outdated; “Current state” could add one line: “UI: scope, chat, library (with selection), notes (with paper bundles), discovery.”

---

## Summary

- **App side:** Library + notes are persisted (Neon). You can chat about **selected papers** only. Notes are under papers in Library and grouped in the Notes tab. Discovery and “Save to library” from AI are in place.
- **Demo gap:** Agent needs **tools** (`save_to_notes`, and optionally `add_to_library`) and, for the full “killer” flow, a **run_benchmark**-style step (later).
- **Slowness:** Addressed mainly in **Elastic**: faster semantic search (and Jina), lean agent tools, and smaller context (you already send selected papers). This repo can support that with a clear Notes API spec for the agent and optional streaming later.

If you want, next we can (1) add a short **agent-tools** doc that specifies `POST /api/notes` for `save_to_notes`, or (2) paste a short “Elastic backend checklist” (semantic search, Jina, agent tools) into PLAN.md or this file.
