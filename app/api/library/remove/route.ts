import { NextRequest, NextResponse } from "next/server";
import { removePapers } from "@/lib/library";

export async function POST(req: NextRequest) {
  let body: { paper_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body.paper_ids;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "paper_ids array is required" },
      { status: 400 }
    );
  }
  const paperIds = raw.map((id) => (id != null ? String(id).trim() : "")).filter(Boolean);

  const { removed, total } = await removePapers(paperIds);
  return NextResponse.json({ removed, total });
}
