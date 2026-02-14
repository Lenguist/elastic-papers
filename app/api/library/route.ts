import { NextRequest, NextResponse } from "next/server";
import { getLibrary, addPapers, type LibraryPaper } from "@/lib/library-store";

export type { LibraryPaper };

export async function GET() {
  return NextResponse.json({ papers: getLibrary() });
}

export async function POST(req: NextRequest) {
  let body: { papers?: LibraryPaper[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const papers = body.papers;
  if (!Array.isArray(papers) || papers.length === 0) {
    return NextResponse.json(
      { error: "papers array is required and must be non-empty" },
      { status: 400 }
    );
  }

  const { added, total } = addPapers(papers);
  return NextResponse.json({
    added: added.length,
    total,
    papers: added,
  });
}
