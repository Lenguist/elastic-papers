#!/usr/bin/env node
/**
 * Test: query Elasticsearch directly (bypass Kibana Agent Builder).
 *
 * Usage:
 *   node scripts/test-es-direct.mjs "Ukrainian question answering"
 *   node scripts/test-es-direct.mjs                # default query
 */

import "dotenv/config";
import { Client } from "@elastic/elasticsearch";

const CLOUD_ID = process.env.ELASTICSEARCH_CLOUD_ID;
const API_KEY = process.env.ELASTICSEARCH_API_KEY;

if (!CLOUD_ID || !API_KEY) {
  console.error("Missing ELASTICSEARCH_CLOUD_ID or ELASTICSEARCH_API_KEY");
  process.exit(1);
}

const es = new Client({ cloud: { id: CLOUD_ID }, auth: { apiKey: API_KEY } });

const query = process.argv[2] || "Ukrainian question answering";

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  TEST: Direct Elasticsearch Search                      ║");
console.log("╚══════════════════════════════════════════════════════════╝");
console.log("");

// First, list available indices
console.log("── Available indices ──");
const indices = await es.cat.indices({ format: "json" });
for (const idx of indices.sort((a, b) => a.index.localeCompare(b.index))) {
  if (idx.index.startsWith(".")) continue;
  console.log(`  ${idx.index.padEnd(40)} docs=${(idx["docs.count"] || "?").toString().padEnd(10)} size=${idx["store.size"]}`);
}
console.log("");

// Try semantic search on the Jina index
const JINA_INDEX = "arxiv-papers-2026-jina";
console.log(`── Searching "${JINA_INDEX}" for: "${query}" ──`);
console.log("");

const start = Date.now();
try {
  const result = await es.search({
    index: JINA_INDEX,
    size: 8,
    query: {
      match: {
        abstract: query,
      },
    },
    _source: ["arxiv_id", "title", "abstract", "authors", "categories", "created"],
  });
  const elapsed = Date.now() - start;

  console.log(`Time: ${elapsed}ms (ES took: ${result.took}ms)`);
  console.log(`Hits: ${result.hits.total?.value ?? result.hits.hits.length}`);
  console.log("");

  for (const hit of result.hits.hits) {
    const s = hit._source;
    console.log(`  [${hit._score?.toFixed(4)}] ${s.arxiv_id} - ${s.title}`);
    console.log(`           categories: ${(s.categories || []).join(", ")} | created: ${s.created}`);
    if (s.abstract) {
      console.log(`           abstract: ${s.abstract.slice(0, 150)}...`);
    }
    console.log("");
  }
} catch (err) {
  console.error("Search failed:", err.message);
  console.log("");
  console.log("Trying basic index instead...");

  // Fallback to basic index
  const result = await es.search({
    index: "arxiv-papers-2026",
    size: 5,
    query: { match: { abstract: query } },
    _source: ["arxiv_id", "title", "categories", "created"],
  });
  const elapsed = Date.now() - start;
  console.log(`Time: ${elapsed}ms | Hits: ${result.hits.total?.value}`);
  for (const hit of result.hits.hits) {
    console.log(`  [${hit._score?.toFixed(4)}] ${hit._source.arxiv_id} - ${hit._source.title}`);
  }
}

console.log("═══════════════════════════════════════════════════════════");
