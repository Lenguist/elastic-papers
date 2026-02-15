import { Client } from "@elastic/elasticsearch";

const CLOUD_ID = process.env.ELASTICSEARCH_CLOUD_ID;
const API_KEY = process.env.ELASTICSEARCH_API_KEY;
const JINA_INDEX = "arxiv-papers-2026-jina";
const BASIC_INDEX = "arxiv-papers-2026";

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

export type ESPaperHit = {
  arxivId: string;
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];
  created: string;
  score: number;
};

type RawHit = { _source?: Record<string, unknown>; _score?: number | null };

function mapHits(hits: RawHit[]): ESPaperHit[] {
  return hits.map((hit) => {
    const src = hit._source ?? {};
    return {
      arxivId: String(src.arxiv_id ?? ""),
      title: String(src.title ?? ""),
      abstract: String(src.abstract ?? ""),
      authors: Array.isArray(src.authors) ? (src.authors as string[]) : [],
      categories: Array.isArray(src.categories) ? (src.categories as string[]) : [],
      created: String(src.created ?? ""),
      score: hit._score ?? 0,
    };
  });
}

/**
 * Semantic search using Jina embeddings on abstract_semantic field.
 * Falls back to keyword search on the basic index if Jina index fails.
 */
export async function searchPapers(
  query: string,
  size: number = 8
): Promise<{ papers: ESPaperHit[]; took: number; total: number; index: string }> {
  const es = getClient();

  try {
    // Semantic search via Jina embeddings
    const result = await es.search({
      index: JINA_INDEX,
      size,
      query: {
        semantic: {
          field: "abstract_semantic",
          query,
        },
      },
      _source: ["arxiv_id", "title", "abstract", "authors", "categories", "created"],
    });

    return {
      papers: mapHits(result.hits.hits as unknown as RawHit[]),
      took: result.took ?? 0,
      total: (result.hits.total as { value: number })?.value ?? result.hits.hits.length,
      index: JINA_INDEX,
    };
  } catch (err) {
    console.warn("Jina semantic search failed, falling back to keyword search:", (err as Error).message);

    // Fallback: keyword search on basic index
    const result = await es.search({
      index: BASIC_INDEX,
      size,
      query: { match: { abstract: query } },
      _source: ["arxiv_id", "title", "abstract", "authors", "categories", "created"],
    });

    return {
      papers: mapHits(result.hits.hits as unknown as RawHit[]),
      took: result.took ?? 0,
      total: (result.hits.total as { value: number })?.value ?? result.hits.hits.length,
      index: BASIC_INDEX,
    };
  }
}

/**
 * Keyword search on title and abstract (BM25).
 * Useful for exact term matching.
 */
export async function keywordSearch(
  query: string,
  size: number = 8
): Promise<{ papers: ESPaperHit[]; took: number; total: number }> {
  const es = getClient();
  const result = await es.search({
    index: JINA_INDEX,
    size,
    query: {
      multi_match: {
        query,
        fields: ["title^2", "abstract"],
      },
    },
    _source: ["arxiv_id", "title", "abstract", "authors", "categories", "created"],
  });

  return {
    papers: mapHits(result.hits.hits as unknown as RawHit[]),
    took: result.took ?? 0,
    total: (result.hits.total as { value: number })?.value ?? result.hits.hits.length,
  };
}

/**
 * Find papers similar to given text using more_like_this.
 * Good for "find papers similar to these in my library."
 */
export async function findSimilarPapers(
  likeText: string,
  size: number = 8,
  excludeIds?: string[]
): Promise<{ papers: ESPaperHit[]; took: number }> {
  const es = getClient();
  const must_not = excludeIds?.length
    ? [{ terms: { arxiv_id: excludeIds } }]
    : [];

  const result = await es.search({
    index: JINA_INDEX,
    size,
    query: {
      bool: {
        must: [
          {
            more_like_this: {
              fields: ["title", "abstract"],
              like: likeText,
              min_term_freq: 1,
              min_doc_freq: 1,
              max_query_terms: 25,
            },
          },
        ],
        must_not,
      },
    },
    _source: ["arxiv_id", "title", "abstract", "authors", "categories", "created"],
  });

  return {
    papers: mapHits(result.hits.hits as unknown as RawHit[]),
    took: result.took ?? 0,
  };
}

/**
 * Get a single paper by arXiv ID.
 */
export async function getPaper(arxivId: string): Promise<ESPaperHit | null> {
  const es = getClient();
  try {
    const result = await es.search({
      index: JINA_INDEX,
      size: 1,
      query: { term: { arxiv_id: arxivId } },
      _source: ["arxiv_id", "title", "abstract", "authors", "categories", "created"],
    });
    const hits = mapHits(result.hits.hits as unknown as RawHit[]);
    return hits[0] ?? null;
  } catch {
    return null;
  }
}
