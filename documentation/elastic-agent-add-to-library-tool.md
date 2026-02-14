# Add to Library & Remove from Library – Elastic Agent / Workflows Tools

The app exposes APIs so your Elastic agent (or workflow) can add and remove papers in the user's library. The agent should **decide when to add** (e.g. when it returns a list of papers) and **by default add** when it has just returned such a list.

---

## Does the workflow feature apply here?

**Yes.** The rep's "workflows can run external tools" is correct in two ways:

1. **Workflows can call your app**  
   Elastic Workflows support an **HTTP action** (`type: http`) with `url`, `method`, `headers`, and `body`. So a workflow step can call `POST https://YOUR_APP_URL/api/library` or `POST https://YOUR_APP_URL/api/library/remove` directly.

2. **The chat agent can use workflows as tools**  
   In Agent Builder you can create a **workflow tool**: the agent triggers a workflow from the conversation, and the workflow's output is returned to the chat. So you can either:
   - **Option A (simplest):** Configure the agent with **HTTP tools** that call your app's URLs (add/remove) directly. No workflow YAML needed.
   - **Option B:** Create a workflow whose only step is an `http` call to your API, then register it as a **workflow tool** so the agent invokes that workflow when it wants to add or remove papers.

So "get AI for CAD papers in 2026" → agent uses **search** → then, if the user wants them saved, the agent calls **add_to_library** (either as an HTTP tool or via a workflow that does the HTTP call). Both are doable.

---

## API

Base URL: use your deployed app (e.g. `https://your-app.vercel.app`).

### List library

**GET** `/api/library`  
Response: `{ "papers": [ { "id", "title", "url?", "authors?" }, ... ] }`

### Add to library

**POST** `/api/library`

**Request body:**
```json
{
  "papers": [
    { "id": "2601.12345", "title": "Paper Title", "url": "https://arxiv.org/abs/2601.12345" },
    { "id": "2602.00001", "title": "Another Paper" }
  ]
}
```

- `id` (required): arXiv ID (e.g. `2601.12345`).
- `title` (optional): Display title. If omitted, `arXiv:{id}` is used.
- `url` (optional): Link; defaults to `https://arxiv.org/abs/{id}`.
- `authors` (optional): Array of author names.

**Response:** `{ "added": 2, "total": 10, "papers": [ /* papers that were actually added */ ] }`

### Remove from library

**POST** `/api/library/remove`

**Request body:**
```json
{
  "paper_ids": [ "2601.12345", "2602.00001" ]
}
```

**Response:** `{ "removed": 2, "total": 8 }`

---

## Configuring tools in Elastic (Agent / Workflows)

Give the chat agent three capabilities: **search** (your existing Elasticsearch/arXiv search), **add_to_library**, and **remove_from_library**.

### Option A: HTTP tools (recommended)

Add two custom tools that call your app:

| Tool name            | Method | URL                              | Body |
|----------------------|--------|----------------------------------|------|
| `add_to_library`     | POST   | `https://YOUR_APP_URL/api/library` | `{ "papers": [ { "id", "title?", "url?" } ] }` |
| `remove_from_library`| POST   | `https://YOUR_APP_URL/api/library/remove` | `{ "paper_ids": [ "id1", "id2" ] }` |

- **add_to_library**  
  Description: Add the given list of papers to the user's library. Call this when you have just returned a list of papers (e.g. from a search) and the user wants them saved, or by default when you return a list. Input: `papers` (array of objects with `id`, optional `title`, optional `url`).

- **remove_from_library**  
  Description: Remove papers from the user's library by arXiv ID. Call when the user asks to remove specific papers or clear some from the library. Input: `paper_ids` (array of arXiv ID strings).

In the agent's system prompt / instructions, tell it to call **add_to_library** when it returns a list of papers (unless the user says not to save), and **remove_from_library** when the user asks to remove papers.

### Option B: Workflow tools (workflow runs external HTTP)

You can expose the same behavior via workflows so the agent triggers a workflow that calls your app.

**Add-to-library workflow example:**

```yaml
version: "1"
name: add_to_library
description: Add papers to the user's library via the research app API.
enabled: true
triggers:
  - type: manual
inputs:
  - name: papers
    type: string
    default: "[]"
steps:
  - name: add_papers
    type: http
    with:
      url: "https://YOUR_APP_URL/api/library"
      method: "POST"
      headers:
        Content-Type: "application/json"
      body:
        papers: "{{ inputs.papers }}"
```

(You may need to pass `papers` as a JSON string and ensure the workflow engine sends valid JSON; adapt to your workflow schema.)

**Remove-from-library workflow example:**

```yaml
version: "1"
name: remove_from_library
description: Remove papers from the user's library by arXiv ID.
enabled: true
triggers:
  - type: manual
inputs:
  - name: paper_ids
    type: string
    default: "[]"
steps:
  - name: remove_papers
    type: http
    with:
      url: "https://YOUR_APP_URL/api/library/remove"
      method: "POST"
      headers:
        Content-Type: "application/json"
      body:
        paper_ids: "{{ inputs.paper_ids }}"
```

Then in Agent Builder: **New tool** → type **Workflow** → select the workflow. The agent will get a tool (e.g. `add_to_library` / `remove_from_library`) that runs the workflow; the workflow's HTTP step calls your app.

---

## Frontend behavior

- **Library tab** loads from `GET /api/library` when the chat view is shown.
- After **each assistant message**, the app calls `GET /api/library` again so any changes made by the agent (add/remove) appear immediately.
- The **"Save to library"** button under assistant messages still uses `POST /api/library`; manual save and agent-driven add use the same API.

---

## Summary

| Who            | Action |
|----------------|--------|
| Elastic agent  | Uses **search**, then **add_to_library** (and **remove_from_library** when the user asks). Either as HTTP tools or via workflow tools that call the same APIs. |
| User           | Can say "get AI for CAD papers in 2026 and add them to my library" or "remove paper X from library"; can also click "Save to library" on a message. |
| Frontend       | Loads library from `GET /api/library` on enter and after each assistant message. |
