import { NextRequest, NextResponse } from "next/server";
import { getLibrary, addPapers, updatePaperContent, type LibraryPaper } from "@/lib/library-store";
import { fetchArxivPaper } from "@/lib/arxiv";

export type { LibraryPaper };

export async function GET() {
  return NextResponse.json({ papers: getLibrary() });
}

/** Enrich library papers with abstract and authors from arXiv (background, non-blocking). */
function enrichPapersInBackground(arxivIds: string[]) {
  void Promise.all(
    arxivIds.map(async (id) => {
      const meta = await fetchArxivPaper(id);
      if (meta) {
        updatePaperContent(id, {
          abstract: meta.abstract,
          authors: meta.authors,
          pdfUrl: meta.pdfUrl,
        });
      }
    })
  );
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
  if (added.length > 0) {
    enrichPapersInBackground(added.map((p) => p.id));
  }
  return NextResponse.json({
    added: added.length,
    total,
    papers: added,
  });
}
