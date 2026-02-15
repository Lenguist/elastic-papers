#!/usr/bin/env node
/**
 * End-to-end test: fetch paper HTML → extract text → chunk → index in ES → semantic search.
 *
 * Usage:
 *   node scripts/test-paper-rag.mjs 2601.12164
 *   node scripts/test-paper-rag.mjs              # default paper
 */

import "dotenv/config";
import { Client } from "@elastic/elasticsearch";

const CLOUD_ID = process.env.ELASTICSEARCH_CLOUD_ID;
const API_KEY = process.env.ELASTICSEARCH_API_KEY;
const es = new Client({ cloud: { id: CLOUD_ID }, auth: { apiKey: API_KEY } });

const arxivId = process.argv[2] || "2601.12164";
const projectId = "test-rag-" + Date.now();
const indexName = `project-library-${projectId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  TEST: Paper RAG Pipeline (HTML extraction)             ║");
console.log("╚══════════════════════════════════════════════════════════╝");
console.log(`Paper: ${arxivId}`);
console.log(`Index: ${indexName}`);
console.log("");

// Step 1: Fetch HTML from arXiv
console.log("── Step 1: Fetching arXiv HTML ──");
const htmlUrl = `https://arxiv.org/html/${arxivId}v1`;
console.log(`  URL: ${htmlUrl}`);
const htmlStart = Date.now();
const htmlRes = await fetch(htmlUrl, {
  headers: { "User-Agent": "ResearchAtelier/1.0" },
  redirect: "follow",
});
if (!htmlRes.ok) {
  console.error(`  Failed: ${htmlRes.status}`);
  process.exit(1);
}
const html = await htmlRes.text();
console.log(`  Fetched ${(html.length / 1024).toFixed(0)}KB in ${Date.now() - htmlStart}ms`);

// Step 2: Extract text from HTML
console.log("\n── Step 2: Extracting text ──");
let text = html
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<nav[\s\S]*?<\/nav>/gi, "")
  .replace(/<header[\s\S]*?<\/header>/gi, "")
  .replace(/<footer[\s\S]*?<\/footer>/gi, "")
  .replace(/<\/?(h[1-6]|p|div|section|article|blockquote|li|tr|br)\b[^>]*>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/[ \t]+/g, " ")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
console.log(`  Extracted ${text.length} chars`);
console.log(`  First 200 chars: ${text.slice(0, 200)}...`);

// Step 3: Chunk
console.log("\n── Step 3: Chunking text ──");
const maxChars = 2000, overlap = 200;
const chunks = [];
let start = 0, idx = 0;
while (start < text.length) {
  let end = start + maxChars;
  if (end < text.length) {
    const pb = text.lastIndexOf("\n\n", end);
    if (pb > start + maxChars * 0.5) end = pb;
    else {
      const sb = text.lastIndexOf(". ", end);
      if (sb > start + maxChars * 0.5) end = sb + 1;
    }
  } else end = text.length;
  const ct = text.slice(start, end).trim();
  if (ct.length > 0)   chunks.push({ text: ct, index: idx++ });
  if (end >= text.length) break;
  start = end - overlap;
}
console.log(`  Created ${chunks.length} chunks (avg ${(text.length / chunks.length).toFixed(0)} chars each)`);

// Step 4: Create ES index with Jina semantic_text
console.log("\n── Step 4: Creating ES index with Jina embeddings ──");
const createStart = Date.now();
await es.indices.create({
  index: indexName,
  mappings: {
    properties: {
      arxiv_id: { type: "keyword" },
      title: { type: "text" },
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
console.log(`  Index created in ${Date.now() - createStart}ms`);

// Step 5: Bulk index chunks
console.log("\n── Step 5: Indexing chunks ──");
const bulkStart = Date.now();
const operations = chunks.flatMap((chunk) => [
  { index: { _index: indexName, _id: `${arxivId}_chunk_${chunk.index}` } },
  {
    arxiv_id: arxivId,
    title: "The Language You Ask In",
    chunk_text: chunk.text,
    chunk_semantic: chunk.text,
    chunk_index: chunk.index,
    total_chunks: chunks.length,
  },
]);
const bulkResult = await es.bulk({ operations, refresh: "wait_for" });
const indexed = bulkResult.items.filter((i) => !i.index?.error).length;
const errors = bulkResult.items.filter((i) => i.index?.error).length;
console.log(`  Indexed ${indexed}/${chunks.length} chunks in ${Date.now() - bulkStart}ms (${errors} errors)`);
if (errors > 0) {
  const firstErr = bulkResult.items.find((i) => i.index?.error);
  console.log(`  First error: ${JSON.stringify(firstErr?.index?.error)}`);
}

// Step 6: Semantic search over chunks
console.log("\n── Step 6: Semantic search ──");
const queries = [
  "What languages were analyzed in the study?",
  "What are the main findings about ideological bias?",
  "What methodology was used?",
];

for (const q of queries) {
  console.log(`\n  Query: "${q}"`);
  const searchStart = Date.now();
  try {
    const searchResult = await es.search({
      index: indexName,
      size: 3,
      query: {
        semantic: {
          field: "chunk_semantic",
          query: q,
        },
      },
      _source: ["arxiv_id", "chunk_text", "chunk_index"],
    });
    const elapsed = Date.now() - searchStart;
    console.log(`  Time: ${elapsed}ms (ES took: ${searchResult.took}ms)`);
    for (const hit of searchResult.hits.hits) {
      const chunk = hit._source?.chunk_text || "";
      console.log(`    [${hit._score?.toFixed(4)}] chunk ${hit._source?.chunk_index}: "${chunk.slice(0, 150)}..."`);
    }
  } catch (err) {
    console.log(`  Search failed: ${err.message}`);
  }
}

// Cleanup: delete test index
console.log("\n── Cleanup ──");
await es.indices.delete({ index: indexName });
console.log(`  Deleted index ${indexName}`);
console.log("\n═══════════════════════════════════════════════════════════");
