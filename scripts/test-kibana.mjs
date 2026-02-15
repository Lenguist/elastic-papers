#!/usr/bin/env node
/**
 * Test script: send a query directly to Kibana Agent Builder and see what comes back.
 *
 * Usage:
 *   node scripts/test-kibana.mjs "what is the state of the art in question answering?"
 *   node scripts/test-kibana.mjs                # uses a default query
 */

import "dotenv/config";

const KIBANA_URL = process.env.KIBANA_URL?.replace(/\/$/, "");
const KIBANA_API_KEY = process.env.KIBANA_API_KEY?.replace(/^"|"$/g, ""); // strip quotes if present
const AGENT_ID = process.env.AGENT_ID || "basic-arxiv-assistant";
const CONNECTOR_ID = "OpenAI-GPT-4-1-Mini";

const query = process.argv[2] || "What are the latest advances in question answering?";

if (!KIBANA_URL || !KIBANA_API_KEY) {
  console.error("Missing KIBANA_URL or KIBANA_API_KEY in .env");
  process.exit(1);
}

const url = `${KIBANA_URL}/api/agent_builder/converse`;
const body = {
  input: query,
  agent_id: AGENT_ID,
  connector_id: CONNECTOR_ID,
};

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  TEST: Kibana Agent Builder                             ║");
console.log("╚══════════════════════════════════════════════════════════╝");
console.log("");
console.log("URL:        ", url);
console.log("Agent ID:   ", AGENT_ID);
console.log("Connector:  ", CONNECTOR_ID);
console.log("Query:      ", query);
console.log("");
console.log("Sending...");
console.log("");

const start = Date.now();

try {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `ApiKey ${KIBANA_API_KEY}`,
      "kbn-xsrf": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const elapsed = Date.now() - start;

  console.log("── RESPONSE ──");
  console.log("Status:     ", res.status, res.statusText);
  console.log("Time:       ", elapsed, "ms");
  console.log("");

  const text = await res.text();

  // Try to parse as JSON for pretty printing
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.log("── RAW BODY (not JSON) ──");
    console.log(text);
    process.exit(res.ok ? 0 : 1);
  }

  console.log("── FULL JSON RESPONSE ──");
  console.log(JSON.stringify(data, null, 2));
  console.log("");

  // Try to extract the answer text
  let answer = "";
  if (typeof data.response === "object" && data.response?.message) {
    answer = data.response.message;
    console.log("── Answer extracted from: data.response.message ──");
  } else if (typeof data.message === "string") {
    answer = data.message;
    console.log("── Answer extracted from: data.message ──");
  } else if (typeof data.output === "object" && data.output?.content) {
    answer = data.output.content;
    console.log("── Answer extracted from: data.output.content ──");
  } else if (typeof data.response === "string") {
    answer = data.response;
    console.log("── Answer extracted from: data.response (string) ──");
  }

  if (answer) {
    console.log("");
    console.log("── EXTRACTED ANSWER ──");
    console.log(answer);
  }

  // Show all top-level keys so you know what fields exist
  console.log("");
  console.log("── TOP-LEVEL KEYS ──");
  console.log(Object.keys(data));

  // If there are tool calls or intermediate steps, show them
  for (const key of Object.keys(data)) {
    if (key === "response" || key === "message" || key === "output") continue;
    const val = data[key];
    if (val && typeof val === "object") {
      console.log(`\n── data.${key} ──`);
      console.log(JSON.stringify(val, null, 2).slice(0, 1000));
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
} catch (err) {
  const elapsed = Date.now() - start;
  console.error("Request failed after", elapsed, "ms:", err.message || err);
  process.exit(1);
}
