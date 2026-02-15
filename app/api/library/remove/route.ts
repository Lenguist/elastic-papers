import { NextRequest, NextResponse } from "next/server";
import { removePapers } from "@/lib/library";

export async function POST(req: NextRequest) {
  let body: { paper_ids?: string[]; project_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.project_id || new URL(req.url).searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const raw = body.paper_ids;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "paper_ids array is required" },
      { status: 400 }
    );
  }
  const paperIds = raw.map((id) => (id != null ? String(id).trim() : "")).filter(Boolean);

  const { removed, total } = await removePapers(projectId, paperIds);
  return NextResponse.json({ removed, total });
}
