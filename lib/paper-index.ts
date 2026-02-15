import { Client } from "@elastic/elasticsearch";
import type { TextChunk } from "./pdf-extract";

const CLOUD_ID = process.env.ELASTICSEARCH_CLOUD_ID;
const API_KEY = process.env.ELASTICSEARCH_API_KEY;

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

/** Index name for a project's paper chunks. */
export function projectIndexName(projectId: string): string {
  // Sanitize: ES index names must be lowercase, no special chars
  const safe = projectId.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `project-library-${safe}`;
}

/**
 * Ensure the project's paper index exists with the right mappings.
 * Uses semantic_text with Jina for chunk embeddings.
 */
export async function ensureProjectIndex(projectId: string): Promise<string> {
  const es = getClient();
  const indexName = projectIndexName(projectId);

  const exists = await es.indices.exists({ index: indexName });
  if (exists) return indexName;

  try {
    await es.indices.create({
      index: indexName,
      mappings: {
        properties: {
          arxiv_id: { type: "keyword" },
          title: { type: "text" },
          authors: { type: "keyword" },
          chunk_text: { type: "text" },
          chunk_semantic: {
            type: "semantic_text",
            inference_id: ".jina-embeddings-v3",
          },
          chunk_index: { type: "integer" },
          total_chunks: { type: "integer" },
        },
      },
    });
    console.log(`  📦 Created project index: ${indexName}`);
  } catch (err) {
    // Race condition: another parallel worker already created it — that's fine
    const errBody = (err as { body?: { error?: { type?: string } } })?.body?.error?.type
      ?? (err as Error)?.message ?? "";
    if (String(errBody).includes("resource_already_exists")) {
      // Index was created by another concurrent call — exactly what we need
    } else {
      throw err; // Re-throw unexpected errors
    }
  }

  return indexName;
}

/**
 * Index all chunks of a paper into the project's ES index.
 */
export async function indexPaperChunks(
  projectId: string,
  arxivId: string,
  title: string,
  authors: string[],
  chunks: TextChunk[]
): Promise<{ indexed: number; indexName: string }> {
  const es = getClient();
  const indexName = await ensureProjectIndex(projectId);

  if (chunks.length === 0) return { indexed: 0, indexName };

  // Bulk index all chunks
  const operations = chunks.flatMap((chunk) => [
    { index: { _index: indexName, _id: `${arxivId}_chunk_${chunk.index}` } },
    {
      arxiv_id: arxivId,
      title,
      authors,
      chunk_text: chunk.text,
      chunk_semantic: chunk.text,
      chunk_index: chunk.index,
      total_chunks: chunks.length,
    },
  ]);

  const result = await es.bulk({ operations, refresh: "wait_for" });

  if (result.errors) {
    const errors = result.items
      .filter((item) => item.index?.error)
      .map((item) => item.index?.error?.reason)
      .slice(0, 3);
    console.warn(`  ⚠️ Some chunks failed to index:`, errors);
  }

  const indexed = result.items.filter((item) => !item.index?.error).length;
  console.log(`  📄 Indexed ${indexed}/${chunks.length} chunks for ${arxivId} into ${indexName}`);
  return { indexed, indexName };
}

export type ChunkSearchResult = {
  arxivId: string;
  title: string;
  chunkText: string;
  chunkIndex: number;
  totalChunks: number;
  score: number;
};

/**
 * Semantic search over a project's paper chunks using Jina embeddings.
 * This is the RAG retrieval step.
 */
export async function searchProjectPapers(
  projectId: string,
  query: string,
  size: number = 6
): Promise<{ results: ChunkSearchResult[]; took: number; indexName: string }> {
  const es = getClient();
  const indexName = projectIndexName(projectId);

  // Check if the index exists
  const exists = await es.indices.exists({ index: indexName });
  if (!exists) {
    return { results: [], took: 0, indexName };
  }

  const result = await es.search({
    index: indexName,
    size,
    query: {
      semantic: {
        field: "chunk_semantic",
        query,
      },
    },
    _source: ["arxiv_id", "title", "chunk_text", "chunk_index", "total_chunks"],
  });

  type HitSource = {
    arxiv_id?: string;
    title?: string;
    chunk_text?: string;
    chunk_index?: number;
    total_chunks?: number;
  };

  const results: ChunkSearchResult[] = result.hits.hits.map((hit) => {
    const src = (hit._source ?? {}) as HitSource;
    return {
      arxivId: String(src.arxiv_id ?? ""),
      title: String(src.title ?? ""),
      chunkText: String(src.chunk_text ?? ""),
      chunkIndex: Number(src.chunk_index ?? 0),
      totalChunks: Number(src.total_chunks ?? 0),
      score: hit._score ?? 0,
    };
  });

  return { results, took: result.took ?? 0, indexName };
}

/**
 * Remove all chunks for a paper from the project index.
 */
export async function removePaperFromIndex(
  projectId: string,
  arxivId: string
): Promise<void> {
  const es = getClient();
  const indexName = projectIndexName(projectId);
  const exists = await es.indices.exists({ index: indexName });
  if (!exists) return;

  await es.deleteByQuery({
    index: indexName,
    query: { term: { arxiv_id: arxivId } },
    refresh: true,
  });
}

/**
 * Delete the entire project index (when project is deleted).
 */
export async function deleteProjectIndex(projectId: string): Promise<void> {
  const es = getClient();
  const indexName = projectIndexName(projectId);
  const exists = await es.indices.exists({ index: indexName });
  if (!exists) return;

  await es.indices.delete({ index: indexName });
  console.log(`  🗑️ Deleted project index: ${indexName}`);
}

/**
 * Get stats about a project's paper index.
 */
export async function getProjectIndexStats(
  projectId: string
): Promise<{ exists: boolean; docCount: number; papers: string[] }> {
  const es = getClient();
  const indexName = projectIndexName(projectId);
  const exists = await es.indices.exists({ index: indexName });
  if (!exists) return { exists: false, docCount: 0, papers: [] };

  const countResult = await es.count({ index: indexName });

  // Get unique paper IDs
  const agg = await es.search({
    index: indexName,
    size: 0,
    aggs: {
      papers: {
        terms: { field: "arxiv_id", size: 100 },
      },
    },
  });

  type AggBucket = { key: string; doc_count: number };
  const buckets = ((agg.aggregations?.papers as { buckets?: AggBucket[] })?.buckets ?? []);
  const papers = buckets.map((b) => b.key);

  return { exists: true, docCount: countResult.count, papers };
}
