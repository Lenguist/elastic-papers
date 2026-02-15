import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/sandbox-session";
import { getTerminateSandboxUrl } from "@/lib/modal-urls";

/**
 * POST /api/sandbox/terminate
 * Body: { "sandbox_id": "..." }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const sandboxId = body.sandbox_id as string;

  if (!sandboxId) {
    return NextResponse.json({ error: "sandbox_id is required" }, { status: 400 });
  }

  // Clean up local session
  deleteSession(sandboxId);

  try {
    await fetch(getTerminateSandboxUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sandbox_id: sandboxId }),
    });
  } catch {
    // Best effort — sandbox may already be gone
  }

  return NextResponse.json({ terminated: true });
}
