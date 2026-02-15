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
  /** Publication year e.g. "2016" from <published> */
  publishedYear?: string;
  /** Full date "YYYY-MM-DD" when available */
  publishedDate?: string;
};

const ARXIV_QUERY = "http://export.arxiv.org/api/query?id_list=";
const ARXIV_LIST = "http://export.arxiv.org/api/query";

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
    const publishedMatch = entry.match(/<published[^>]*>([\s\S]*?)<\/published>/);
    const publishedStr = publishedMatch ? stripTags(publishedMatch[1]).trim() : "";
    const publishedYear = publishedStr.match(/^(\d{4})/)?.[1];
    const publishedDate = publishedStr.match(/^(\d{4})-(\d{2})-(\d{2})/)?.[0];
    return {
      id,
      title,
      abstract,
      authors: authorNames,
      pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
      publishedYear,
      publishedDate: publishedDate || undefined,
    };
  } catch {
    return null;
  }
}

/** Parse one <entry> block from Atom XML into ArxivPaperMeta. */
function parseEntry(entryXml: string): ArxivPaperMeta | null {
  const idMatch = entryXml.match(/<id>[\s\S]*?arxiv\.org\/abs\/([0-9.]+)[\s\S]*?<\/id>/);
  const id = idMatch ? idMatch[1] : "";
  if (!id) return null;
  const titleMatch = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  const summaryMatch = entryXml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
  const title = titleMatch
    ? decodeEntities(stripTags(titleMatch[1]))
    : `arXiv:${id}`;
  const abstract = summaryMatch
    ? decodeEntities(stripTags(summaryMatch[1]))
    : "";
  const authorNames: string[] = [];
  const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi;
  let authorMatch;
  while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
    authorNames.push(decodeEntities(stripTags(authorMatch[1])));
  }
  const publishedMatch = entryXml.match(/<published[^>]*>([\s\S]*?)<\/published>/);
  const publishedStr = publishedMatch ? stripTags(publishedMatch[1]).trim() : "";
  const publishedYear = publishedStr.match(/^(\d{4})/)?.[1];
  const publishedDate = publishedStr.match(/^(\d{4})-(\d{2})-(\d{2})/)?.[0];
  return {
    id,
    title,
    abstract,
    authors: authorNames,
    pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
    publishedYear,
    publishedDate: publishedDate || undefined,
  };
}

/** Fetch recent papers in an arXiv category (e.g. cs.AI, cs.LG). */
export async function fetchRecentByCategory(
  category: string,
  maxResults: number = 20
): Promise<ArxivPaperMeta[]> {
  const cat = String(category).trim() || "cs.AI";
  try {
    const url = `${ARXIV_LIST}?search_query=cat:${encodeURIComponent(cat)}&sortBy=submittedDate&sortOrder=descending&start=0&max_results=${Math.min(maxResults, 50)}`;
    const res = await fetch(url, { headers: { Accept: "application/atom+xml" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    const papers: ArxivPaperMeta[] = [];
    for (const entry of entries) {
      const p = parseEntry(entry);
      if (p) papers.push(p);
    }
    return papers;
  } catch {
    return [];
  }
}
