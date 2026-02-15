# Current State & Next Steps

**Last updated:** Feb 15 2026 — after adding OpenAI orchestrator with ES tools, per-project Jina RAG indexing, Discovery recommendations, full PDF extraction pipeline.

---

## What's Done

### Core Features
| Feature | Status | Details |
|---------|--------|---------|
| **Projects** | ✅ | Create / list / delete projects. Auto-generated names via OpenAI. Persisted in Neon. |
| **Library** | ✅ | Add/remove/approve papers; persisted in Neon. Per-paper checkboxes for focused chat context. |
| **Paper ingestion pipeline** | ✅ | Add paper → fetch arXiv metadata → extract full text (HTML endpoint) → extract GitHub links → chunk text → index into per-project ES index with Jina semantic embeddings. All async, non-blocking. |
| **Notes** | ✅ | Create/edit/delete. General + paper-linked. Notion-style grouping by paper. Persisted in Neon. |
| **Code tab** | ✅ | GitHub repos auto-extracted from paper full text and abstracts. Displayed per-paper. |
| **AI Chat (OpenAI orchestrator)** | ✅ | GPT-4o-mini with tool-use loop (up to 5 rounds). 4 tools: `search_papers`, `search_library_papers`, `get_paper_details`, `deep_research`. Multi-turn conversation with history. |
| **Search — global** | ✅ | Semantic search via Jina (`arxiv-papers-2026-jina` index, `semantic_text` field). Falls back to keyword search on `arxiv-papers-2026`. |
| **Search — library RAG** | ✅ | Semantic search over per-project paper chunks (`project-library-{id}` indices with Jina `.jina-embeddings-v3`). Passage-level retrieval for deep questions. |
| **Deep research** | ✅ | Elastic Agent Builder integration as a tool — Kibana `converse` API. Slower but more thorough. |
| **Discovery — browse** | ✅ | `/discovery` — recent papers by arXiv category (cs.AI, cs.LG, cs.CV, cs.CL, cs.GR). |
| **Discovery — recommendations** | ✅ | ES `more_like_this` over library papers' titles+abstracts against global index. Excludes papers already in library. "For you" / "Browse" toggle. |
| **Save to library from AI** | ✅ | Structured paper cards in chat responses with select/add-to-library. Also fallback for markdown-linked papers. |
| **Selected papers context** | ✅ | Select papers in library → next chat only sends those as context. |
| **PDF Reader** | ⚠️ | `/reader/[arxivId]` — iframe PDF viewer + ChatSidebar. ChatSidebar doesn't pass `project_id` to chat API (minor bug). |

### Backend / Elastic
| Component | Status | Details |
|-----------|--------|---------|
| **Elasticsearch Cloud** | ✅ | Elastic Cloud deployment (9.x). |
| **Main index (keyword)** | ✅ | `arxiv-papers-2026` — ~2k+ papers, title/abstract/authors/categories/created. |
| **Main index (Jina)** | ✅ | `arxiv-papers-2026-jina` — same papers with `abstract_semantic` as `semantic_text` + Jina inference. |
| **Per-project indices** | ✅ | `project-library-{id}` — paper chunks with `chunk_semantic` as `semantic_text` + `.jina-embeddings-v3`. Created on-demand when papers are added. |
| **Jina Embeddings v3** | ✅ | Configured as Elastic inference endpoint (`.jina-embeddings-v3`). Used for both global search and per-project RAG. |
| **Elastic Agent Builder** | ✅ | `basic-arxiv-assistant` agent. Called via `deep_research` tool. |
| **Neon (PostgreSQL)** | ✅ | Projects, library, notes tables. Schema in `scripts/schema.sql` / `scripts/schema-v2.sql`. |

### Persistence
- **Neon DB** for: projects, library papers (with metadata, abstracts, GitHub links), notes (general + paper-linked)
- **Elasticsearch** for: global paper search, per-project full-text RAG indices
- **In-memory fallback** if no DB configured

---

## Prize Requirements

| Requirement | Status | Where / How |
|-------------|--------|-------------|
| Best end-to-end Agentic system | ✅ | OpenAI orchestrator with 4 ES-backed tools, multi-turn conversation, library/notes/code management, per-project RAG. |
| Depth & creativity of ES implementation | ✅ | Semantic search (Jina), per-project RAG indices, `more_like_this` recommendations, keyword fallback, Agent Builder integration. Multiple index types. |
| Use of JINA for embeddings | ✅ | Jina v3 via Elastic Inference — used in both global index (`arxiv-papers-2026-jina`) and per-project library indices (`semantic_text` + `.jina-embeddings-v3`). |
| Elastic Agent Builder | ✅ | `deep_research` tool calls Agent Builder `converse` API for thorough multi-step queries. |
| Elastic Workflows | ⚠️ | Not explicitly used as a named Workflow. The tool-use loop in the chat API is functionally a workflow (search → RAG → answer). Could wrap in a Kibana Workflow for extra credit. |
| Elastic Cloud | ✅ | All ES operations against Elastic Cloud. Cloud ID + API Key auth. |

---

## What's Missing / Can Improve (2-hour sprint)

### High Priority (directly improves demo / prize)
| Task | Effort | Impact |
|------|--------|--------|
| **Fix Reader page** — pass `project_id` to ChatSidebar | 10 min | Fixes broken reader chat |
| **Ingest more papers** — run ingestion to bulk up the main index (currently ~2k) | 15 min | Better search results, better recommendations |
| **Add Elastic Workflow** — even a simple one wrapping search → agent | 30-60 min | Checks the "Workflows" prize box |
| **Demo script** — write a step-by-step demo flow to follow during presentation | 20 min | Smooth demo |

### Medium Priority (polish)
| Task | Effort | Impact |
|------|--------|--------|
| **Streaming chat responses** — show tokens as they arrive | 1-2 hrs | Feels much faster |
| **Delete project → clean up ES index** — `deleteProjectIndex()` exists but isn't called on project delete | 10 min | Cleanup |
| **Error states in UI** — some background tasks fail silently | 30 min | Better UX |
| **Reader ChatSidebar project context** | 15 min | Paper-specific chat works fully |

### Lower Priority (nice-to-have)
| Task | Effort | Impact |
|------|--------|--------|
| **Agent `save_to_notes` tool** — let the AI write notes directly | 30 min | Cool demo moment |
| **Hybrid search** — combine keyword + semantic for better results | 30 min | Better search quality |
| **More arXiv categories** in Discovery browse | 5 min | Broader exploration |

### Not doing now (future / post-hackathon)
- Modal code execution ("get paper's code running")
- Cross-paper benchmark comparisons
- Dataset management
- Research alerts
- Collaborative projects

---

## Architecture Summary

```
User → Next.js UI (React 19 / Tailwind)
  ├── /discovery → Recommendations (ES more_like_this) + Browse (arXiv API)
  ├── / (chat)   → POST /api/chat
  │                  ├── OpenAI GPT-4o-mini (orchestrator)
  │                  │    ├── search_papers      → ES semantic search (Jina)
  │                  │    ├── search_library_papers → ES per-project RAG (Jina)
  │                  │    ├── get_paper_details   → ES get by ID
  │                  │    └── deep_research       → Elastic Agent Builder
  │                  └── Library context from Neon DB
  ├── /projects  → Neon DB CRUD
  └── /reader    → PDF iframe + chat sidebar

Paper ingestion (background, on library add):
  arXiv metadata → HTML full text → chunk → ES index (Jina semantic_text)
```

---

## Files Reference

| Area | Key Files |
|------|-----------|
| Chat API | `app/api/chat/route.ts` |
| Library API | `app/api/library/route.ts`, `lib/library.ts`, `lib/db.ts` |
| Notes API | `app/api/notes/route.ts`, `app/api/notes/[id]/route.ts` |
| Projects API | `app/api/projects/route.ts` |
| Discovery API | `app/api/discovery/trending/route.ts`, `app/api/discovery/recommendations/route.ts` |
| ES global search | `lib/elasticsearch.ts` |
| ES per-project RAG | `lib/paper-index.ts` |
| ES recommendations | `lib/recommendations.ts` |
| Paper extraction | `lib/pdf-extract.ts` |
| arXiv API | `lib/arxiv.ts` |
| DB (Neon) | `lib/db.ts`, `scripts/schema.sql` |
| Pages | `app/page.tsx`, `app/discovery/page.tsx`, `app/projects/page.tsx`, `app/reader/[arxivId]/page.tsx` |
