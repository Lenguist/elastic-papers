import { NextRequest, NextResponse } from "next/server";

const KIBANA_URL = process.env.KIBANA_URL?.replace(/\/$/, "");
const KIBANA_API_KEY = process.env.KIBANA_API_KEY;
const AGENT_ID = process.env.AGENT_ID || "basic-arxiv-assistant";

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

  const url = `${KIBANA_URL}/api/agent_builder/converse`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `ApiKey ${KIBANA_API_KEY}`,
      "kbn-xsrf": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: message, agent_id: AGENT_ID }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Agent API ${res.status}`, detail: text.slice(0, 300) },
      { status: 502 }
    );
  }

  const data = (await res.json()) as Record<string, unknown>;
  const out = data.output as Record<string, unknown> | undefined;
  const text =
    (typeof out === "object" && out && typeof out.content === "string"
      ? out.content
      : (data.response as string)) || String(data);

  return NextResponse.json({ response: text });
}
