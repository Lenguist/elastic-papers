import { NextRequest, NextResponse } from "next/server";
import { getLibrary, addPapers, updatePaperContent, type LibraryPaper } from "@/lib/library";
import { hasDb } from "@/lib/db";
import { fetchArxivPaper } from "@/lib/arxiv";
import { extractPaperContent, chunkText } from "@/lib/pdf-extract";
import { indexPaperChunks } from "@/lib/paper-index";

export type { LibraryPaper };

function getProjectId(req: NextRequest): string | null {
  return new URL(req.url).searchParams.get("project_id");
}

export async function GET(req: NextRequest) {
  const projectId = getProjectId(req);
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const papers = await getLibrary(projectId);
  const source = hasDb() ? "db" : "memory";
  return NextResponse.json({ papers, _source: source });
}

/**
 * Enrich library papers with metadata from arXiv, then fetch PDF,
 * extract full text, chunk it, and index into the project's ES index
 * with Jina semantic embeddings. Runs in background (non-blocking).
 */
function enrichAndIndexPapersInBackground(projectId: string, arxivIds: string[]) {
  void Promise.all(
    arxivIds.map(async (id) => {
      try {
        // Step 1: Fetch metadata from arXiv API
        const meta = await fetchArxivPaper(id);
        if (meta) {
          await updatePaperContent(projectId, id, {
            abstract: meta.abstract,
            authors: meta.authors,
            pdfUrl: meta.pdfUrl,
            publishedYear: meta.publishedYear,
            publishedDate: meta.publishedDate,
            title: meta.title,
          });
        }

        // Step 2: Extract full text + GitHub links (HTML preferred)
        console.log(`  📥 Extracting text for ${id}...`);
        const { text: fullText, githubLinks } = await extractPaperContent(id);
        console.log(`  📝 Extracted ${fullText.length} chars from ${id}${githubLinks.length ? ` (${githubLinks.length} GitHub links)` : ""}`);

        // Save GitHub links to library paper metadata
        if (githubLinks.length > 0) {
          await updatePaperContent(projectId, id, { githubLinks });
        }

        // Step 3: Chunk the text
        const chunks = chunkText(fullText);
        console.log(`  🔪 Split into ${chunks.length} chunks for ${id}`);

        // Step 4: Index chunks into per-project ES index with Jina embeddings
        if (chunks.length > 0) {
          const title = meta?.title ?? id;
          const authors = meta?.authors ?? [];
          await indexPaperChunks(projectId, id, title, authors, chunks);
        }
      } catch (err) {
        console.error(`  ❌ Failed to index paper ${id}:`, (err as Error).message);
      }
    })
  );
}

export async function POST(req: NextRequest) {
  let body: { papers?: LibraryPaper[]; project_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.project_id || getProjectId(req);
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const papers = body.papers;
  if (!Array.isArray(papers) || papers.length === 0) {
    return NextResponse.json(
      { error: "papers array is required and must be non-empty" },
      { status: 400 }
    );
  }

  const { added, total } = await addPapers(projectId, papers);
  if (added.length > 0) {
    enrichAndIndexPapersInBackground(projectId, added.map((p) => p.id));
  }
  return NextResponse.json({
    added: added.length,
    total,
    papers: added,
  });
}
