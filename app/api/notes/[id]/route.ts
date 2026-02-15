import { NextRequest, NextResponse } from "next/server";
import { updateNote, deleteNote } from "@/lib/notes";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { content?: string };
  try {
    body = await _req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const content = body.content != null ? String(body.content) : "";
  await updateNote(id, content);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteNote(id);
  return NextResponse.json({ ok: true });
}
