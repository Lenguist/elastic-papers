import { Client } from "@elastic/elasticsearch";
import type { LibraryPaper } from "@/lib/library-store";

const CLOUD_ID = process.env.ELASTICSEARCH_CLOUD_ID;
const API_KEY = process.env.ELASTICSEARCH_API_KEY;
const MAIN_INDEX = process.env.ES_INDEX || "arxiv-papers-2026";

let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    if (!CLOUD_ID || !API_KEY) {
      throw new Error("Missing ELASTICSEARCH_CLOUD_ID or ELASTICSEARCH_API_KEY");
    }
    client = new Client({ cloud: { id: CLOUD_ID }, auth: { apiKey: API_KEY } });
  }
  return client;
}

export type RecommendedPaper = {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  pdfUrl: string;
  score: number;
  categories: string[];
};

/**
 * Get paper recommendations based on library papers using Elasticsearch more_like_this.
 * Falls back gracefully if ES is unavailable.
 */
export async function getRecommendations(
  libraryPapers: LibraryPaper[],
  limit: number = 20
): Promise<{ papers: RecommendedPaper[]; source: string }> {
  if (libraryPapers.length === 0) {
    return { papers: [], source: "empty_library" };
  }

  // Build combined text from library papers for the more_like_this query
  const likeText = libraryPapers
    .map((p) => [p.title, p.abstract].filter(Boolean).join(". "))
    .filter((t) => t.length > 5)
    .join("\n\n")
    .slice(0, 8000); // Limit text length for the query

  if (!likeText || likeText.length < 20) {
    return { papers: [], source: "insufficient_text" };
  }

  const libraryIds = new Set(libraryPapers.map((p) => p.id));

  try {
    const es = getClient();

    // Check if the main index exists
    const exists = await es.indices.exists({ index: MAIN_INDEX });
    if (!exists) {
      return { papers: [], source: "no_index" };
    }

    const result = await es.search({
      index: MAIN_INDEX,
      size: limit + libraryIds.size, // Over-fetch to account for filtering
      query: {
        bool: {
          must: {
            more_like_this: {
              fields: ["title", "abstract"],
              like: likeText,
              min_term_freq: 1,
              max_query_terms: 30,
              min_doc_freq: 1,
              minimum_should_match: "15%",
            },
          },
          must_not: {
            terms: {
              arxiv_id: [...libraryIds],
            },
          },
        },
      },
      _source: ["arxiv_id", "title", "abstract", "authors", "categories"],
    });

    type HitSource = {
      arxiv_id?: string;
      title?: string;
      abstract?: string;
      authors?: string[];
      categories?: string[];
    };

    const papers: RecommendedPaper[] = result.hits.hits
      .map((hit) => {
        const src = (hit._source ?? {}) as HitSource;
        const id = String(src.arxiv_id ?? "");
        return {
          id,
          title: String(src.title ?? ""),
          abstract: String(src.abstract ?? ""),
          authors: Array.isArray(src.authors) ? src.authors : [],
          pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
          score: hit._score ?? 0,
          categories: Array.isArray(src.categories) ? src.categories : [],
        };
      })
      .filter((p) => p.id && !libraryIds.has(p.id))
      .slice(0, limit);

    return { papers, source: "elasticsearch" };
  } catch (err) {
    console.error("Recommendation ES error:", (err as Error).message);
    return { papers: [], source: "es_error" };
  }
}
