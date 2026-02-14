import { NextRequest, NextResponse } from "next/server";
import { getLibrary } from "@/lib/library-store";

const KIBANA_URL = process.env.KIBANA_URL?.replace(/\/$/, "");
const KIBANA_API_KEY = process.env.KIBANA_API_KEY;
const AGENT_ID = process.env.AGENT_ID || "basic-arxiv-assistant";

function buildLibraryContext(): string {
  const papers = getLibrary();
  if (papers.length === 0) return "";
  const lines = papers.map((p, i) => {
    const num = i + 1;
    const meta = [
      `Title: ${p.title}`,
      `arXiv ID: ${p.id}`,
      p.abstract ? `Abstract: ${p.abstract}` : "",
      p.authors?.length ? `Authors: ${p.authors.join(", ")}` : "",
      p.pdfUrl ? `PDF: ${p.pdfUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return `--- Paper ${num} ---\n${meta}`;
  });
  return (
    "The user's library contains the following papers. Use this to answer questions about papers in their library, compare them, or summarize.\n\n" +
    lines.join("\n\n") +
    "\n\n"
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = (body.message as string)?.trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  if (!KIBANA_URL || !KIBANA_API_KEY) {
    return NextResponse.json(
      { error: "Set KIBANA_URL and KIBANA_API_KEY in env" },
      { status: 500 }
    );
  }

  const libraryContext = buildLibraryContext();
  const inputToAgent =
    libraryContext.length > 0
      ? `${libraryContext}User question: ${message}`
      : message;

  const url = `${KIBANA_URL}/api/agent_builder/converse`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `ApiKey ${KIBANA_API_KEY}`,
      "kbn-xsrf": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: inputToAgent, agent_id: AGENT_ID }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Agent API ${res.status}`, detail: text.slice(0, 300) },
      { status: 502 }
    );
  }

  const data = (await res.json()) as Record<string, unknown>;
  
  // Try to extract text from various possible response structures
  let text = "";
  
  // Check for response.message field (nested structure)
  if (typeof data.response === "object" && data.response) {
    const resp = data.response as Record<string, unknown>;
    if (typeof resp.message === "string") {
      text = resp.message;
    }
  }
  // Check for message field (Agent Builder format)
  else if (typeof data.message === "string") {
    text = data.message;
  }
  // Check for output.content field
  else if (typeof data.output === "object" && data.output) {
    const out = data.output as Record<string, unknown>;
    if (typeof out.content === "string") {
      text = out.content;
    }
  }
  // Check for response as string
  else if (typeof data.response === "string") {
    text = data.response;
  }
  // Fallback to stringifying the whole response
  else {
    text = JSON.stringify(data, null, 2);
  }

  return NextResponse.json({ response: text });
}
