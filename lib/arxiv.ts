/**
 * Fetch paper metadata (title, abstract, authors) and PDF URL from arXiv API.
 * PDF URL is always https://arxiv.org/pdf/{id}.pdf
 */
export type ArxivPaperMeta = {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  pdfUrl: string;
};

const ARXIV_QUERY = "http://export.arxiv.org/api/query?id_list=";

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export async function fetchArxivPaper(arxivId: string): Promise<ArxivPaperMeta | null> {
  const id = String(arxivId).trim();
  if (!id) return null;
  try {
    const res = await fetch(`${ARXIV_QUERY}${encodeURIComponent(id)}`, {
      headers: { Accept: "application/atom+xml" },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    // Atom feed: first <entry> has title, summary, author(s)
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return null;
    const entry = entryMatch[1];
    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const summaryMatch = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
    const title = titleMatch
      ? decodeEntities(stripTags(titleMatch[1]))
      : `arXiv:${id}`;
    const abstract = summaryMatch
      ? decodeEntities(stripTags(summaryMatch[1]))
      : "";
    const authorNames: string[] = [];
    const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      authorNames.push(decodeEntities(stripTags(authorMatch[1])));
    }
    return {
      id,
      title,
      abstract,
      authors: authorNames,
      pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
    };
  } catch {
    return null;
  }
}
