import { NextRequest, NextResponse } from "next/server";
import { getLibrary } from "@/lib/library";

const MODAL_ENDPOINT_URL = process.env.MODAL_ENDPOINT_URL;

/**
 * POST /api/deploy-demo
 *
 * Resolves a paper's GitHub repo and calls the Modal deployment agent.
 * Supports two modes:
 *   - stream=1 (query param): passes SSE stream through to the client (for frontend live view)
 *   - default: collects the full SSE stream and returns final JSON (for chat agent tool)
 *
 * Body:
 *   { "repo_url": "https://github.com/..." }
 *   { "paper_id": "2601.12345", "project_id": "proj-abc" }
 *   Optional: "task" — extra instructions for the agent.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const stream = req.nextUrl.searchParams.get("stream") === "1";

  let repoUrl: string | undefined = body.repo_url;
  const paperId: string | undefined = body.paper_id;
  const projectId: string | undefined = body.project_id;
  const task: string | undefined = body.task;
  const envVars: Record<string, string> | undefined = body.env_vars;

  // ── Resolve paper → repo URL if not provided directly ──────────────
  if (!repoUrl && paperId && projectId) {
    const papers = await getLibrary(projectId);
    const paper = papers.find((p) => p.id === paperId);
    if (!paper) {
      return NextResponse.json(
        { error: "Paper not found in library", paper_id: paperId },
        { status: 404 }
      );
    }
    if (paper.githubLinks && paper.githubLinks.length > 0) {
      repoUrl = paper.githubLinks[0];
    } else {
      return NextResponse.json(
        { error: "No GitHub repository found for this paper", paper_id: paperId },
        { status: 404 }
      );
    }
  }

  if (!repoUrl) {
    return NextResponse.json(
      { error: "repo_url is required (or paper_id + project_id to resolve)" },
      { status: 400 }
    );
  }

  if (!repoUrl.startsWith("https://github.com/")) {
    return NextResponse.json(
      { error: "Only public GitHub HTTPS URLs are supported." },
      { status: 400 }
    );
  }

  if (!MODAL_ENDPOINT_URL) {
    return NextResponse.json(
      { error: "MODAL_ENDPOINT_URL not configured. Deploy the Modal app first." },
      { status: 500 }
    );
  }

  // ── Call Modal endpoint ────────────────────────────────────────────
  console.log(`\n🚀 Deploy demo: ${repoUrl} (stream=${stream})`);
  const start = Date.now();

  try {
    const modalResponse = await fetch(MODAL_ENDPOINT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo_url: repoUrl,
        task: task || "",
        ...(envVars && Object.keys(envVars).length > 0 ? { env_vars: envVars } : {}),
      }),
    });

    if (!modalResponse.ok) {
      const text = await modalResponse.text();
      console.error(`  Modal error ${modalResponse.status}: ${text.slice(0, 300)}`);
      return NextResponse.json(
        { error: "Modal deployment failed", status_code: modalResponse.status, detail: text.slice(0, 500) },
        { status: 502 }
      );
    }

    // ── Streaming mode: pass SSE through to client ───────────────
    if (stream && modalResponse.body) {
      console.log("  Streaming SSE to client...");
      return new Response(modalResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // ── Blocking mode: collect SSE stream, return final JSON ─────
    const text = await modalResponse.text();
    const events = text.split("\n\n").filter(Boolean);
    let finalResult: Record<string, unknown> | null = null;

    for (const event of events) {
      const lines = event.split("\n");
      let eventType = "";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) eventType = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (eventType === "complete" && data) {
        try {
          finalResult = JSON.parse(data);
        } catch { /* ignore parse errors */ }
      }
    }

    const elapsed = Date.now() - start;
    console.log(`  ✅ Deploy finished in ${elapsed}ms — status: ${finalResult?.status ?? "unknown"}`);

    if (!finalResult) {
      return NextResponse.json(
        { error: "No result from Modal agent", raw: text.slice(0, 1000) },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ...finalResult,
      paper_id: paperId || null,
      elapsed_ms: elapsed,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`  ❌ Deploy error after ${elapsed}ms:`, (err as Error).message);
    return NextResponse.json(
      { error: "Failed to reach Modal endpoint", detail: (err as Error).message?.slice(0, 300) },
      { status: 502 }
    );
  }
}
