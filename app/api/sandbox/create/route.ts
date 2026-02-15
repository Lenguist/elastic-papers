import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/sandbox-session";
import { getCreateSandboxUrl } from "@/lib/modal-urls";

/**
 * POST /api/sandbox/create
 * Creates a Modal sandbox and clones a repo.
 *
 * Body: { "repo_url": "https://github.com/...", "env_vars": { ... } }
 * Returns: { "sandbox_id": "...", "repo_url": "...", ... }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const repoUrl = body.repo_url as string;
  const envVars = body.env_vars as Record<string, string> | undefined;

  if (!repoUrl) {
    return NextResponse.json({ error: "repo_url is required" }, { status: 400 });
  }

  const modalUrl = getCreateSandboxUrl();
  console.log(`\n🔧 Creating sandbox for ${repoUrl}`);
  console.log(`  Modal URL: ${modalUrl}`);

  try {
    const res = await fetch(modalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, env_vars: envVars || {} }),
    });

    // Handle non-JSON responses (Modal returns plain text on 500s)
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.includes("application/json")) {
      const text = await res.text();
      console.error(`  Modal error ${res.status}: ${text.slice(0, 200)}`);
      return NextResponse.json(
        { error: `Modal returned ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json();

    if (data.error || !data.sandbox_id) {
      console.error("  Sandbox creation failed:", data.error);
      return NextResponse.json({ error: data.error || "Failed to create sandbox" }, { status: 502 });
    }

    createSession(data.sandbox_id, repoUrl);
    console.log(`  ✅ Sandbox created: ${data.sandbox_id}`);

    return NextResponse.json({
      sandbox_id: data.sandbox_id,
      repo_url: repoUrl,
      clone_output: data.clone_output,
      ls_output: data.ls_output,
    });
  } catch (err) {
    console.error("  Sandbox creation error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to create sandbox: " + (err as Error).message },
      { status: 502 }
    );
  }
}
