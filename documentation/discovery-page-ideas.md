# Discovery Page – Implementation Notes

## Goal
A **Discovery** page where users can explore papers without starting a chat: trending papers, browse by category, maybe search.

## Feature ideas

| Feature | Description | How to implement |
|--------|-------------|-------------------|
| **Trending / latest** | Show recent papers that are “hot” or just new | arXiv API: `search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending`. “Trending” = latest in selected categories (no real view counts on arXiv). |
| **Browse by category** | Pick a category (e.g. cs.AI, cs.LG, cs.CV) and see latest | Same API; category selector → change `cat:cs.XX` in query. |
| **Featured / picks** | Curated list (e.g. “AI for CAD”, “LLMs”) | Hardcoded list or fixed queries; or “trending in [topic]” with a few preset topics. |
| **Quick search** | Search bar on Discovery | Link to main atelier (scope + chat) or call Elastic/arXiv search API and show results on Discovery. |
| **Add to library** | One-click add from Discovery | Reuse `POST /api/library`; same as chat “Save to library”. |

## Data source: arXiv API
- **List recent by category:**  
  `http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&start=0&max_results=20`
- **Parse:** Same Atom XML as in `lib/arxiv.ts`; or add a shared parser and use it in a new **GET /api/discovery/trending** (or **/api/discovery/papers**) that takes `category` and `limit` and returns JSON (title, id, abstract, authors, link, pdf).

## UI structure
- **Nav:** “Research atelier” (home) | “Discovery” so users can switch between chat and discovery.
- **Sections:** e.g. “Trending in AI”, “Latest in ML”, “Latest in Computer Vision” – each section calls the API with the right category and renders a list of cards (title, authors, abstract snippet, [arXiv] [PDF] [Add to library]).
- **Style:** Reuse the same gradient + white card look as the main page for consistency.

## Phased implementation
1. **Phase 1:** Discovery page + one “Trending” section (e.g. latest cs.AI) via **/api/discovery/trending**, cards with Add to library.
2. **Phase 2:** Category selector or multiple sections (cs.AI, cs.LG, cs.CV).
3. **Phase 3:** Optional search bar on Discovery (or deep link to atelier with scope pre-filled).

## Technical notes
- **CORS:** Call arXiv from a **Next.js API route** (e.g. `/api/discovery/trending`), not from the browser, to avoid CORS.
- **Caching:** Consider caching API responses for 5–15 minutes so Discovery loads fast and we don’t hit arXiv too often.
- **Add to library:** Reuse existing `POST /api/library`; after add, refetch library if needed (e.g. for a badge count).
