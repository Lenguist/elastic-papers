import { NextRequest, NextResponse } from "next/server";
import { removePapers } from "@/lib/library";

export async function POST(req: NextRequest) {
  let body: { paper_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const paperIds = body.paper_ids;
  if (!Array.isArray(paperIds)) {
    return NextResponse.json(
      { error: "paper_ids array is required" },
      { status: 400 }
    );
  }

  const { removed, total } = await removePapers(paperIds);
  return NextResponse.json({ removed, total });
}
