# Elastic Papers

arXiv papers in Elasticsearch + chat via Agent Builder.

## Setup

1. `pip install -r requirements.txt`
2. Copy `.env.example` to `.env` and fill in credentials (or create `.env` with):

```
ELASTICSEARCH_CLOUD_ID=...
ELASTICSEARCH_API_KEY=...
KIBANA_URL=https://your-kibana-url   # From Elastic Cloud → Connection Details
KIBANA_API_KEY=...                   # Kibana API key (search "API keys" in Kibana)
AGENT_ID=basic-arxiv-assistant       # Optional, defaults to this
```

## Run App

**Option A: Next.js (Vercel frontend)**
```bash
npm install
npm run dev
```
Open http://localhost:3000

**Option B: FastAPI (standalone chat)**
```bash
uvicorn app:app --reload
```
Open http://localhost:8000

For Vercel: add `KIBANA_URL` and `KIBANA_API_KEY` in project env vars.

## Commands

- `python scripts/create_index.py list` – list indices
- `python scripts/create_index.py semantic` – create semantic index
- `python ingest_arxiv.py --start 2024-01 --end 2026-02` – monthly backfill (all years)
- `python ingest_arxiv.py --from 2026-01-01 --until 2026-02-14` – single date range
- `ES_INDEX=arxiv-papers-2026-semantic python ingest_arxiv.py --start 2025-01 --end 2026-02` – ingest into semantic index
