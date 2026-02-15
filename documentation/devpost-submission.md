# Research Atelier — Devpost Submission

## Inspiration

Research is broken. Not the science itself — the workflow around it.

Every researcher we know spends a staggering amount of time on tasks that should be automated: figuring out which papers are relevant to your work, discovering that someone already solved a problem you've been working on for months, trying to reproduce results from a paper only to find the code doesn't run, or bouncing between a PDF viewer, a citation manager, a Google Doc for notes, and a terminal for code — all disconnected.

There are tools to search papers. There are tools to manage citations. There are coding agents to get code up and running. But it's so scattered and uneven that most researchers we know still just read a PDF and take notes in a Google Doc.

We wanted to build the tool we wish we had: a single place where you can discover papers, understand them deeply, compare approaches, take notes, and eventually run the code — all with an AI assistant that actually understands what you're working on.

## What it does

Research Atelier has two core modes:

**Discovery Mode.** Based on papers you've already read and your active projects, we recommend other papers you might find relevant. Under the hood, this uses Elasticsearch's `more_like_this` query over our database of arXiv papers — matching on titles and abstracts to surface work that's conceptually similar to what you're already exploring. The idea is simple: "Hey, based on what you're reading, we think you might like these." You can also browse by arXiv category (AI, ML, NLP, Computer Vision, etc.) if you want to explore more broadly.

**Work Mode.** This is where you lock in. You create a project — say, "Ukrainian question answering" — and it becomes your workspace. Each project has:

- **Library** — your curated collection of papers. When you add a paper, we fetch the full PDF, extract the text, chunk it, and index it into a per-project Elasticsearch index with Jina semantic embeddings. This means you can later ask deep questions about what's actually *in* those papers.
- **Notes** — Notion-style notes, both general and linked to specific papers. Keep your thoughts organized as you go.
- **Code** — GitHub repositories automatically extracted from papers in your library. We scan the full text of each paper for repo links and surface them in one place.
- **AI Chat** — an OpenAI-powered research assistant that uses Elasticsearch as its backbone. It has four tools:
  1. `search_papers` — semantic search over 100k+ arXiv papers (Jina embeddings) to discover new work
  2. `search_library_papers` — RAG over the full text of papers in your library. Ask "what benchmarks did paper X use?" and get the actual answer from the paper content
  3. `get_paper_details` — fetch metadata for a specific arXiv ID
  4. `deep_research` — a fallback that invokes Elastic Agent Builder for multi-step reasoning

The typical flow looks like: ask the agent to find papers on a topic → it searches Elasticsearch → you add the relevant ones to your library → the PDFs get indexed → you chat about the papers' content in depth → you take notes on your findings. The library, notes, and recommendations all persist across sessions.

**What's next (intention):** We're building toward the agent being able to spin up a Modal instance, clone a paper's code repository, get it running, and give you access to test it — so you can go from reading a paper to reproducing its results in one conversation. The idea is: "hey, can you get this paper's code running as a demo?" and it just works.

## How we built it

The stack is centered around **Elasticsearch on Elastic Cloud** as the knowledge backbone:

- **Global paper index** (`arxiv-papers-2026`): ~2k+ arXiv papers with title, abstract, authors, categories. Used for discovery and the `search_papers` tool. Ingested via arXiv OAI-PMH API with a custom Python pipeline.
- **Per-project library indices**: When a paper is added to a project's library, we fetch the full PDF via arXiv's HTML endpoint, extract clean text, chunk it (~1000 char chunks), and index each chunk into a dedicated Elasticsearch index using `semantic_text` with **Jina Embeddings v3** (`.jina-embeddings-v3` inference endpoint). This gives us passage-level semantic search over the actual content of papers the user is working with.
- **Recommendations**: Elasticsearch's `more_like_this` query takes the user's library papers' titles and abstracts as the "like" text and finds similar papers in the global index, excluding what's already in the library.
- **Elastic Agent Builder**: Available as a "deep research" tool — the agent invokes Kibana's Agent Builder `converse` API for multi-step, workflow-based search when a more thorough investigation is needed.

The **frontend** is Next.js 15 (App Router) with React 19, TypeScript, and Tailwind CSS. The **AI orchestration** uses OpenAI's `gpt-4o-mini` with a tool-use loop — the model decides which Elasticsearch tools to call, we execute them, feed results back, and repeat (up to 5 rounds). **Persistence** is Neon (serverless PostgreSQL) for library papers, notes, and projects.

The architecture deliberately separates concerns: OpenAI handles reasoning and conversation, Elasticsearch handles retrieval and knowledge, and the app stitches them together with a tool-use loop that lets the AI agent leverage Elastic's search capabilities naturally.

## Challenges we ran into

**Elastic Agent Builder as the sole agent was too slow and inflexible.** Our initial approach was to use Elastic Agent Builder as the primary chat agent. But response times of 10-15 seconds made conversations painful, and we couldn't easily control the agent's behavior or give it access to our custom tools (library management, per-project search). We pivoted to using OpenAI as the orchestrator with Elasticsearch as the retrieval backend — and kept Agent Builder as a "deep research" fallback tool. This gave us sub-2-second responses for most queries while still leveraging Elastic's full capabilities when needed.

**Full-text paper extraction is messy.** arXiv papers come as PDFs with wildly inconsistent formatting. We tried PDF parsing libraries but the text quality was poor. Our breakthrough was discovering arXiv's HTML rendering endpoint (available for most 2024+ papers) — it gives clean, structured text that's much better for chunking and embedding. We fall back to abstract-only for older papers.

**Per-project indexing at scale.** Each project gets its own Elasticsearch index with Jina embeddings. Creating indices, handling race conditions (two papers being added simultaneously), and managing the async pipeline (add paper → fetch PDF → extract text → chunk → index) without blocking the UI required careful background processing. We use fire-and-forget async tasks that update paper metadata as they complete.

**Keeping context focused.** Sending an entire library's worth of paper abstracts as context to the LLM was slow and expensive. We added paper selection — you can check specific papers in your library and the next chat message only includes those as context. Combined with the RAG tool (which retrieves specific passages rather than entire papers), this keeps the context window lean and the answers precise.

## Accomplishments that we're proud of

- **The full paper ingestion pipeline**: add a paper to your library → PDF fetched → text extracted → chunked → indexed with Jina embeddings → searchable in seconds. It just works.
- **Two-tier search architecture**: global semantic search (100k+ papers) for discovery, plus per-project full-text RAG for deep questions about papers you're working with. The agent knows when to use which.
- **The recommendation system**: `more_like_this` over your library gives surprisingly good "you might like these" suggestions with zero training data needed — just Elasticsearch doing what it does best.
- **The UI**: we're genuinely proud of how it looks and feels. The gradient design, the Notion-style notes, the paper cards with expandable abstracts and one-click library adds — it feels like a tool researchers would actually want to use.

## What we learned

- **Elasticsearch `semantic_text` is magic for prototyping.** You declare a field as `semantic_text`, point it at an inference endpoint (Jina), and indexing + querying just works. No manual embedding pipelines, no vector dimension math. It let us go from "no embeddings" to "full semantic search" in under an hour.
- **Tool-use loops are the right abstraction for agentic systems.** Rather than trying to make one monolithic agent do everything, giving a capable LLM a set of well-defined tools (each backed by Elasticsearch) and letting it decide what to call turned out to be far more flexible and debuggable than any single-agent approach.
- **`more_like_this` is underrated.** We expected to need fancy embedding-based similarity for recommendations. But MLT with good text fields gives remarkably relevant results out of the box — and it's fast, because it's just a clever TF-IDF query under the hood.
- **The gap between "search" and "understanding" is where the real value is.** Finding papers is a solved problem. Helping researchers actually understand, compare, and build on those papers is where the tooling falls short — and where the combination of RAG + LLM + structured project management shines.

## What's next for Research Atelier

- **Code execution via Modal**: The big missing piece. We want the agent to be able to clone a paper's GitHub repo, spin up a Modal sandbox, install dependencies, and give the researcher a running demo. "Get this paper's code running" should be a one-line request.
- **Paper-vs-paper comparisons**: Structured side-by-side comparisons — benchmarks, methods, datasets, results — generated from the full text of papers in your library.
- **Richer recommendations**: Moving beyond `more_like_this` to hybrid search (combining keyword + semantic similarity), citation graph analysis, and eventually learning from your reading patterns.
- **Collaborative projects**: Multiple researchers working on the same project, sharing libraries and notes.
- **Broader paper coverage**: Expanding beyond arXiv to PubMed, Semantic Scholar, and conference proceedings.

---

## Built With

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Elasticsearch (Elastic Cloud)
- Elastic Agent Builder
- Jina Embeddings v3 (via Elastic Inference)
- Kibana
- OpenAI API (GPT-4o-mini)
- Neon (Serverless PostgreSQL)
- arXiv API
- Python
- Node.js
- Vercel
