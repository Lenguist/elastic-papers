import { NextRequest, NextResponse } from "next/server";
import { getNotes, createNote } from "@/lib/notes";

export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const notes = await getNotes(projectId);
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  let body: { content?: string; paper_id?: string; project_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.project_id || new URL(req.url).searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const content = body.content != null ? String(body.content).trim() : "";
  const paperId = body.paper_id != null ? String(body.paper_id).trim() || undefined : undefined;
  const note = await createNote(projectId, content, paperId);
  if (!note) return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  return NextResponse.json({ note });
}
