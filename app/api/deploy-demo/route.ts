import { NextRequest, NextResponse } from "next/server";
import { getLibrary } from "@/lib/library";

const MODAL_ENDPOINT_URL = process.env.MODAL_ENDPOINT_URL;

/**
 * POST /api/deploy-demo
 *
 * Resolves a paper's GitHub repo and calls the Modal deployment agent.
 *
 * Body:
 *   { "repo_url": "https://github.com/..." }                     — direct repo
 *   { "paper_id": "2601.12345", "project_id": "proj-abc" }       — resolve from library
 *   { "paper_id": "...", "project_id": "...", "repo_url": "..." } — prefer repo_url
 *
 * Optional: "task" — extra instructions for the agent.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  let repoUrl: string | undefined = body.repo_url;
  const paperId: string | undefined = body.paper_id;
  const projectId: string | undefined = body.project_id;
  const task: string | undefined = body.task;

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
      repoUrl = paper.githubLinks[0]; // use the first GitHub link
    } else {
      return NextResponse.json(
        {
          error: "No GitHub repository found for this paper",
          paper_id: paperId,
          hint: "The paper doesn't have an associated code repository.",
        },
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

  // Basic validation
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
  console.log(`\n🚀 Deploy demo: ${repoUrl}`);
  const start = Date.now();

  try {
    const modalResponse = await fetch(MODAL_ENDPOINT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, task: task || "" }),
    });

    if (!modalResponse.ok) {
      const text = await modalResponse.text();
      console.error(`  Modal error ${modalResponse.status}: ${text.slice(0, 300)}`);
      return NextResponse.json(
        {
          error: "Modal deployment failed",
          status_code: modalResponse.status,
          detail: text.slice(0, 500),
        },
        { status: 502 }
      );
    }

    const result = await modalResponse.json();
    const elapsed = Date.now() - start;
    console.log(`  ✅ Deploy finished in ${elapsed}ms — status: ${result.status}`);

    return NextResponse.json({
      ...result,
      paper_id: paperId || null,
      elapsed_ms: elapsed,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`  ❌ Deploy error after ${elapsed}ms:`, (err as Error).message);
    return NextResponse.json(
      {
        error: "Failed to reach Modal endpoint",
        detail: (err as Error).message?.slice(0, 300),
      },
      { status: 502 }
    );
  }
}
