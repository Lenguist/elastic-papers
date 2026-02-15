#!/usr/bin/env node
/**
 * End-to-end test: OpenAI orchestrator chat with ES tools.
 * Tests the same logic as the /api/chat route but without Next.js.
 *
 * Usage:
 *   node scripts/test-chat-openai.mjs "What are the latest papers on Ukrainian question answering?"
 */

import "dotenv/config";
import OpenAI from "openai";
import { Client } from "@elastic/elasticsearch";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const es = new Client({
  cloud: { id: process.env.ELASTICSEARCH_CLOUD_ID },
  auth: { apiKey: process.env.ELASTICSEARCH_API_KEY },
});

const JINA_INDEX = "arxiv-papers-2026-jina";

// ─── Tool definitions (same as route.ts) ──────────────────────────────────────
const tools = [
  {
    type: "function",
    function: {
      name: "search_papers",
      description: "Search the arXiv paper database using Elasticsearch with Jina semantic embeddings. Returns titles, abstracts, authors, arXiv IDs.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
          num_results: { type: "number", description: "Number of results (default 8, max 20)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_paper_details",
      description: "Get full details of a specific paper by arXiv ID.",
      parameters: {
        type: "object",
        properties: { arxiv_id: { type: "string" } },
        required: ["arxiv_id"],
      },
    },
  },
];

// ─── Tool execution ───────────────────────────────────────────────────────────
async function executeTool(name, args) {
  console.log(`  🔧 Calling ${name}(${JSON.stringify(args)})`);
  const start = Date.now();

  if (name === "search_papers") {
    const size = Math.min(Math.max(args.num_results || 8, 1), 20);
    const result = await es.search({
      index: JINA_INDEX,
      size,
      query: { semantic: { field: "abstract_semantic", query: args.query } },
      _source: ["arxiv_id", "title", "abstract", "authors", "categories", "created"],
    });
    const elapsed = Date.now() - start;
    const papers = result.hits.hits.map((h) => ({
      arxiv_id: h._source.arxiv_id,
      title: h._source.title,
      abstract: (h._source.abstract || "").slice(0, 400),
      authors: (h._source.authors || []).slice(0, 5),
      categories: h._source.categories,
      score: h._score,
    }));
    console.log(`  ✅ ${name} → ${papers.length} results in ${elapsed}ms (ES took: ${result.took}ms)`);
    return JSON.stringify({ results: papers, took: result.took, total: result.hits.total?.value });
  }

  if (name === "get_paper_details") {
    const result = await es.search({
      index: JINA_INDEX,
      size: 1,
      query: { term: { arxiv_id: args.arxiv_id } },
      _source: ["arxiv_id", "title", "abstract", "authors", "categories", "created"],
    });
    const elapsed = Date.now() - start;
    const paper = result.hits.hits[0]?._source;
    console.log(`  ✅ ${name} → ${paper ? paper.title : "NOT FOUND"} in ${elapsed}ms`);
    return paper
      ? JSON.stringify(paper)
      : JSON.stringify({ error: "Not found" });
  }

  return JSON.stringify({ error: "Unknown tool" });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const query = process.argv[2] || "What are the latest papers on Ukrainian question answering?";

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  TEST: OpenAI Orchestrator + ES Tools                   ║");
console.log("╚══════════════════════════════════════════════════════════╝");
console.log(`Query: "${query}"`);
console.log("");

const totalStart = Date.now();

const messages = [
  {
    role: "system",
    content: `You are a research assistant. You have access to an Elasticsearch database of 100k+ arXiv CS papers indexed with Jina semantic embeddings. Use search_papers to find papers, then summarize findings. Format papers as: **[Title](https://arxiv.org/abs/ID)**`,
  },
  { role: "user", content: query },
];

let response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages,
  tools,
  tool_choice: "auto",
  max_tokens: 2000,
});

let loops = 0;
while (response.choices[0]?.finish_reason === "tool_calls" && loops < 5) {
  loops++;
  const toolCalls = response.choices[0].message.tool_calls || [];
  messages.push(response.choices[0].message);

  for (const tc of toolCalls) {
    if (tc.type !== "function") continue;
    const args = JSON.parse(tc.function.arguments);
    const result = await executeTool(tc.function.name, args);
    messages.push({ role: "tool", tool_call_id: tc.id, content: result });
  }

  response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    tools,
    tool_choice: "auto",
    max_tokens: 2000,
  });
}

const totalElapsed = Date.now() - totalStart;
const answer = response.choices[0]?.message?.content || "(no answer)";
const usage = response.usage;

console.log("\n── Response ──");
console.log(answer);
console.log("");
console.log("── Stats ──");
console.log(`Total time: ${totalElapsed}ms`);
console.log(`Tool loops: ${loops}`);
console.log(`Tokens: ${usage?.prompt_tokens ?? "?"}in / ${usage?.completion_tokens ?? "?"}out`);
console.log("═══════════════════════════════════════════════════════════");
