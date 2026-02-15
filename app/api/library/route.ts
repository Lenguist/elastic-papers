import { NextRequest, NextResponse } from "next/server";
import { getLibrary, addPapers, updatePaperContent, type LibraryPaper } from "@/lib/library";
import { hasDb } from "@/lib/db";
import { fetchArxivPaper } from "@/lib/arxiv";

export type { LibraryPaper };

export async function GET() {
  const papers = await getLibrary();
  // So you can verify: "db" = using Neon, "memory" = in-memory (no env or not connected)
  const source = hasDb() ? "db" : "memory";
  return NextResponse.json({ papers, _source: source });
}

/** Enrich library papers with abstract and authors from arXiv (background, non-blocking). */
function enrichPapersInBackground(arxivIds: string[]) {
  void Promise.all(
    arxivIds.map(async (id) => {
      const meta = await fetchArxivPaper(id);
      if (meta) {
        await updatePaperContent(id, {
          abstract: meta.abstract,
          authors: meta.authors,
          pdfUrl: meta.pdfUrl,
          publishedYear: meta.publishedYear,
          publishedDate: meta.publishedDate,
          title: meta.title,
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

  const { added, total } = await addPapers(papers);
  if (added.length > 0) {
    enrichPapersInBackground(added.map((p) => p.id));
  }
  return NextResponse.json({
    added: added.length,
    total,
    papers: added,
  });
}
