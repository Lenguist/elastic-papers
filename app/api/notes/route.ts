import { NextRequest, NextResponse } from "next/server";
import { getNotes, createNote } from "@/lib/notes";

export async function GET() {
  const notes = await getNotes();
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  let body: { content?: string; paper_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const content = body.content != null ? String(body.content).trim() : "";
  const paperId = body.paper_id != null ? String(body.paper_id).trim() || undefined : undefined;
  const note = await createNote(content, paperId);
  if (!note) return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  return NextResponse.json({ note });
}
