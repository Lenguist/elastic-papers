# Full-PDF Access & Split Agent Architecture

## 1. How to give the agent access to full PDFs (general approach)

Right now the agent only sees **metadata + abstract** (from arXiv API). To support “ask about the full paper,” you need the **full text** of each library paper in a form the model can read.

### Steps

1. **Get the PDF**  
   We already have the URL: `https://arxiv.org/pdf/{id}.pdf`. When a paper is added to the library, the backend can `fetch` this URL and get the PDF bytes.

2. **Extract text from the PDF**  
   - **Option A (Node):** Use a library like `pdf-parse` or `pdf2json` to extract text in the API route or a background job.  
   - **Option B (Python / separate service):** Use PyMuPDF (`fitz`) or `pypdf` in a small script or service; your Next.js app calls it or reads from a shared store.  
   - **Option C (external):** Use a PDF-to-text API; then you only store the returned text.

3. **Store the text (or chunks)**  
   - **Simple:** Store `fullText: string` (or by section) per paper in your library store (or DB).  
   - **RAG-style:** Chunk the text, embed chunks, and store in a vector store (e.g. Elasticsearch, Pinecone, or a simple in-memory index). You don’t have to use Elastic agent for this; any embedding model + vector store works.

4. **Give the text to the model**  
   - **Direct context:** For a small library, you can paste “Paper 1: … full text … Paper 2: …” into the prompt (or a summary per paper). Context window limits how many full papers fit.  
   - **RAG:** On each user question, retrieve the top-k chunks from the library (by similarity to the question), then send only those chunks + the question to the model. This scales to many/long papers.  
   - **Tool:** The agent has a tool “get_paper_full_text(paper_id)”. When it needs to “read” a paper, it calls the tool; the backend returns extracted text for that paper (or a section). The agent then uses that in the next turn.

So: **download PDF → extract text → store (full text or chunks) → feed to model via context or RAG or tool.** That’s the general approach to “make it work” with full PDFs.

---

## 2. Split architecture: Elastic for search, another agent (e.g. Claude) for library Q&A

You’re right that using the Elastic agent **only for search** and a **different agent (e.g. Claude) for “folder of papers” Q&A** can work well and often feels faster.

### Why it helps

- **Elastic agent** is great for: querying your index, finding papers, maybe add_to_library. It can be slow when it runs many tools/workflows and multi-step reasoning.  
- **Library Q&A** (“summarize my library”, “what does paper X say about Y?”) doesn’t need Elastic’s search at all. It only needs: the list of papers + their **full text** (or retrieved chunks). A single call to **Claude** (or another LLM) with that context is often much faster than routing the same question through the Elastic agent.

So: **Elastic = search + discovery; Claude (or similar) = “agent with access to the folder of papers.”**

### How it would work

- **Search path**  
  - User: “Find papers on AI for CAD.”  
  - Frontend or backend calls the **Elastic agent** (or direct Elasticsearch/arXiv search API).  
  - Results are shown; user adds some to the library.  
  - No PDF content needed in this path.

- **Library Q&A path**  
  - User: “Summarize the papers in my library” or “What do my library papers say about STEP?”  
  - Backend:  
    1. Loads the **library** (paper ids, titles, and stored **extracted full text** or top-k **RAG chunks** for the question).  
    2. Builds a prompt that includes that “folder” of content (e.g. “Papers in the user’s library: … [full text or chunks] … User question: …”).  
    3. Calls **Claude** (or another LLM) once with that prompt.  
  - Response goes straight back to the user. **No Elastic agent in this path**, so you avoid its tool/workflow latency.

- **Routing**  
  - **Option A:** Heuristic – if the message mentions “library”, “my papers”, “these papers”, or the library is non-empty and the question is generic, route to **library Q&A (Claude)**; otherwise route to **Elastic (search)**.  
  - **Option B:** Two entry points in the UI – e.g. “Search” (Elastic) vs “Ask about my library” (Claude + folder).  
  - **Option C:** Single box; backend decides based on intent (e.g. a cheap classifier or keywords).

### “Folder” = your library + stored text

The “folder” is just: **for each paper in the library, we have its extracted full text (or chunks) stored**. When the user asks about the library, we pass that content (or retrieved chunks) to Claude. So the implementation is: **library list + per-paper full text (or RAG over those papers)**. No need for a real filesystem folder; it’s “the set of papers we’ve already enriched with full text.”

---

## 3. Summary

| Goal | Approach |
|------|----------|
| **Full-PDF access** | Download PDF from arXiv → extract text (pdf-parse / PyMuPDF / API) → store full text or chunks → give to model via context, RAG, or “read paper” tool. |
| **Faster library Q&A** | Use **Elastic agent only for search**. Use **Claude (or other LLM) with the “folder” (library + extracted text)** for any question about the user’s library. One LLM call, no Elastic tools in the loop. |
| **Would it work?** | Yes. Split architecture is a good fit: Elastic for finding papers, Claude for answering from the full text of those papers. |

Next implementation steps could be: (1) add PDF download + text extraction when a paper is added to the library, (2) store that text (or chunks) in your library store or a small vector index, (3) add a “library Q&A” API path that builds context from the library + text and calls Claude, and (4) route chat to either Elastic (search) or Claude (library) based on intent or UI.
