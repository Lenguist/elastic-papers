# Elastic Papers – TreeHacks Prize Plan

## Big Picture: Hosted vs Serverless

You're on **Elastic Cloud Hosted** (version 8.11). Here's the difference:

| | **Hosted** (what you have) | **Serverless** |
|---|---------------------------|----------------|
| **What it is** | Traditional deployment, you pick version (8.11, 9.x, etc.) | Usage-based, Elastic manages everything |
| **How you know** | `es.info()` returns `8.11.0` | No version number; different URL structure |
| **Agent Builder** | Needs 9.2+ (upgrade deployment) | Available (GA) |
| **Pricing** | By provisioned RAM/CPU | By usage (queries, storage) |

### Your Two Paths

**Path A: Stay on Hosted, upgrade to 9.x**
- In Elastic Cloud console → your deployment → Upgrade
- Pick 9.2 or 9.3
- Re-index papers (or migrate)
- Agent Builder becomes available in Kibana

**Path B: Create Serverless project**
- Elastic Cloud → Create project → Elasticsearch Serverless
- Different deployment; need to re-ingest papers
- Agent Builder + modern features available by default

**Recommendation:** Try Path A first (upgrade to 9.x). Simpler if you already have data.

---

## Semantic Search: The Easy Way (Your Tutorial)

The Kibana tutorial uses `semantic_text` – no manual embeddings:

```json
PUT /my_index
{
  "mappings": {
    "properties": {
      "text": { "type": "semantic_text" }
    }
  }
}
```

- **Default:** Uses ELSER (Elastic’s model)
- **Jina:** Add `inference_id` pointing to a Jina inference endpoint
- **Ingest:** You index text; Elasticsearch embeds it automatically
- **Query:** `match` on the `semantic_text` field = semantic search

So: use `semantic_text` + Jina inference endpoint → “Use of JINA” ✅ and semantic search without custom embedding code.

---

## Prize Requirements Checklist

| Requirement | Status | How We Address It |
|-------------|--------|-------------------|
| Best end-to-end Agentic system | ✅ | OpenAI orchestrator with 4 ES-backed tools (search, RAG, get, Agent Builder), multi-turn tool-use loop, library/notes/code management |
| Depth & creativity of ES implementation | ✅ | Jina semantic search, per-project RAG indices, `more_like_this` recommendations, keyword fallback, Agent Builder as deep-research tool, multiple index types |
| Use of JINA for embeddings | ✅ | Jina v3 (`.jina-embeddings-v3`) via Elastic Inference — global index + per-project library indices use `semantic_text` |
| Use of Elastic Agent Builder | ✅ | `basic-arxiv-assistant` agent, called via `deep_research` tool through Kibana `converse` API |
| Use of Elastic Workflows | ⚠️ | Tool-use loop is functionally a workflow; could wrap in a named Kibana Workflow for full credit |
| Use of Elastic Cloud | ✅ | All ES operations on Elastic Cloud (Cloud ID + API Key) |

---

## Current State

**Elasticsearch indices:**
- `arxiv-papers-2026` — ~2k+ papers, keyword search (title, abstract, authors, categories)
- `arxiv-papers-2026-jina` — same papers with `semantic_text` + Jina embeddings on abstract
- `project-library-{id}` — per-project paper chunk indices with Jina `semantic_text` (created on-demand)

**App features (all working):**
- UI: projects, chat (OpenAI + ES tools), library (selection, approve, notes, GitHub links), notes tab, code tab, discovery (recommendations + browse), PDF reader
- Chat: GPT-4o-mini orchestrator with `search_papers`, `search_library_papers`, `get_paper_details`, `deep_research` tools
- Paper pipeline: add to library → arXiv metadata → HTML full text extraction → chunking → Jina semantic indexing (per-project ES index)
- Discovery: `more_like_this` recommendations from library, arXiv category browse
- Persistence: Neon PostgreSQL (projects, library, notes)

**Still missing:**
- Elastic Workflows (named workflow in Kibana)
- Streaming chat responses
- Modal code execution (future)

---

## Phase 1: Semantic Search (semantic_text)

### Easiest: semantic_text (like your Kibana tutorial)

Create index – abstract is auto-embedded on ingest:

```json
PUT /arxiv-papers-2026-semantic
{
  "mappings": {
    "properties": {
      "arxiv_id": { "type": "keyword" },
      "title": { "type": "text" },
      "abstract": { "type": "semantic_text" },
      "authors": { "type": "keyword" },
      "categories": { "type": "keyword" },
      "created": { "type": "date" }
    }
  }
}
```

- **Default:** Uses ELSER. Add `"inference_id": "jina-embeddings-v3"` to `abstract` for Jina (if available).
- **Query:** `GET index/_search` with `{"query": {"match": {"abstract": "your question"}}}` = semantic search.

### Jina specifically (prize requirement)
- If Jina inference endpoint exists: add `inference_id` to the `semantic_text` field.
- Else: use Jina API during ingestion + `dense_vector` field (manual).

---

## Phase 2: Elastic Agent Builder Setup (2–3 hrs)

### Requirement
Agent Builder needs **Elastic Stack 9.2+** (preview) or **9.3+** (GA). Your deployment is 8.11.

**Action:** Create new Elastic Cloud deployment on 9.x, or use **Elastic Cloud Serverless** (Agent Builder GA there). Migrate index or re-ingest.

### Agent Setup
1. In Kibana: **Machine Learning** → **Agent Builder**
2. Create agent: "arXiv Research Assistant"
3. Add custom tools:
   - `semantic_search` – kNN on `abstract_embedding` using Jina-embedded query
   - `keyword_search` – match on title/abstract
   - `get_paper` – fetch by arxiv_id
   - `trending_topics` – aggregation on categories

4. Assign tools to agent
5. Add system prompt: "You are a research assistant over arXiv 2026. Answer questions using the search tools. Always cite paper IDs."

---

## Phase 3: Elastic Workflows (1–2 hrs)

### Goal
Chain actions so the system qualifies as "agentic" and uses Workflows.

### Example Workflow: "Research Question → Cited Answer"
```
Trigger: Manual or API
Inputs: user_question

Steps:
1. ai.agent (or kibana.request)
   - Invoke Agent with user_question
   - Agent uses tools → returns answer + cited papers

2. (Optional) aggregation step
   - Get trending categories for "depth"
   - Or: find related papers via more_like_this

3. Return structured response
```

Define in Kibana **Stack Management** → **Workflows** or via API.

---

## Phase 4: UI (2–3 hrs)

### V0: Chat Interface
- Simple Next.js or React page
- Chat input → call Agent Builder API (REST or A2A)
- Display agent response + citations
- Links to arXiv for each paper

### V1 (if time)
- "Explore similar" button → triggers semantic search
- Topic aggregation chart (categories)
- Paper detail panel with abstract

---

## Depth & Creativity – ES Features to Use

| Feature | Where |
|---------|-------|
| **kNN / dense_vector** | Semantic search via Jina embeddings |
| **Hybrid search** | Combine `match` (keyword) + `knn` (semantic) in bool query |
| **Aggregations** | `terms` on categories for trending topics, research gaps |
| **Nested / objects** | (Optional) Store sections if we add section-level embeddings |
| **Script score** | (Optional) Boost by recency or citation count |
| **more_like_this** | "Papers similar to this one" |
| **Custom tools** | Agent tools that run ES queries |

---

## How to Do It (Step-by-Step)

### Step 1: Upgrade for Agent Builder
- [ ] Elastic Cloud console → your deployment → **Upgrade** to 9.2 or 9.3 (or create Serverless project)
- [ ] Confirm: Kibana → Machine Learning / AI → "Agent Builder"

### Step 2: Add Jina + semantic_text
- [ ] Create Jina inference endpoint (Stack Management → Inference), or use ELSER default
- [ ] Create index with abstract as semantic_text (see Phase 1 mapping)
- [ ] Re-run ingestion - embeddings auto-generated on ingest

### Step 3: Agent Builder
- [ ] Create agent with tools: semantic search, keyword search, get paper

### Step 4: Workflow
- [ ] Create workflow that invokes agent

### Step 5: UI
- [ ] Chat page - Agent Builder API

---

## Timeline (Hackathon)

| Block | Task | Hours |
|-------|------|-------|
| Sat AM | JINA embeddings + index | 2–3 |
| Sat PM | Agent Builder (if deployment ready) | 2 |
| Sat PM | Workflow + basic chat | 2 |
| Sun AM | UI polish, demo prep | 2 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Agent Builder not on 8.11 | Use Serverless or new 9.x deployment |
| Inference Service not available | Use Jina API during ingestion |
| Ingestion too slow with embeddings | Start with 1–2k papers, optimize batching |

---

## Files to Create/Modify

```
elastic-papers/
├── ingest_arxiv_2026.py      # Add Jina embedding step
├── lib/
│   ├── jina.py               # Jina API client
│   └── es_schema.py          # Index mapping with dense_vector
├── app/                      # Next.js UI
│   ├── page.tsx              # Chat interface
│   └── api/
│       └── chat/route.ts     # Proxy to Agent Builder
└── PLAN.md                   # This file
```
