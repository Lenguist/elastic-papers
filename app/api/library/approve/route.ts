import { NextRequest, NextResponse } from "next/server";
import { setPaperApproved } from "@/lib/library";

export async function POST(req: NextRequest) {
  let body: { paper_id?: string; approved?: boolean; project_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.project_id || new URL(req.url).searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const paperId = body.paper_id;
  const approved = body.approved;
  if (typeof paperId !== "string" || paperId.trim() === "") {
    return NextResponse.json({ error: "paper_id is required" }, { status: 400 });
  }
  if (typeof approved !== "boolean") {
    return NextResponse.json({ error: "approved must be true or false" }, { status: 400 });
  }
  await setPaperApproved(projectId, paperId.trim(), approved);
  return NextResponse.json({ ok: true, paper_id: paperId, approved });
}
