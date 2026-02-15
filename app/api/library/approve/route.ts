import { NextRequest, NextResponse } from "next/server";
import { setPaperApproved } from "@/lib/library";

export async function POST(req: NextRequest) {
  let body: { paper_id?: string; approved?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const paperId = body.paper_id;
  const approved = body.approved;
  if (typeof paperId !== "string" || paperId.trim() === "") {
    return NextResponse.json({ error: "paper_id is required" }, { status: 400 });
  }
  if (typeof approved !== "boolean") {
    return NextResponse.json({ error: "approved must be true or false" }, { status: 400 });
  }
  await setPaperApproved(paperId.trim(), approved);
  return NextResponse.json({ ok: true, paper_id: paperId, approved });
}
