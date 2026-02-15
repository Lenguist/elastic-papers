export type LibraryPaper = {
  id: string;
  title: string;
  url?: string;
  authors?: string[];
  abstract?: string;
  pdfUrl?: string;
  /** ISO date when added to library */
  addedAt?: string;
  /** Publication year e.g. "2016" (fallback when no full date) */
  publishedYear?: string;
  /** Full publication date ISO "YYYY-MM-DD" when available */
  publishedDate?: string;
  /** User approved (checkmark); new auto-added papers start false */
  approved?: boolean;
};

let library: LibraryPaper[] = [];

export function getLibrary(): LibraryPaper[] {
  return library;
}

export function addPapers(
  papers: Array<{
    id: string;
    title?: string;
    url?: string;
    authors?: string[];
  }>
): { added: LibraryPaper[]; total: number } {
  const now = new Date().toISOString();
  const normalized = papers
    .map((p): LibraryPaper | null => {
      const id = String(p?.id ?? "").trim();
      const rawTitle = String(p?.title ?? "").trim();
      const title = rawTitle && !/^arXiv:\d+\.\d+/i.test(rawTitle) ? rawTitle : "Untitled";
      const url = p?.url ?? `https://arxiv.org/abs/${id}`;
      const pdfUrl = `https://arxiv.org/pdf/${id}.pdf`;
      if (!id) return null;
      return { id, title, url, pdfUrl, authors: p?.authors, addedAt: now, approved: false };
    })
    .filter((p): p is LibraryPaper => p !== null);

  const existingIds = new Set(library.map((p) => p.id));
  const toAdd = normalized.filter((p) => !existingIds.has(p.id));
  library = [...library, ...toAdd];
  return { added: toAdd, total: library.length };
}

export function removePapers(paperIds: string[]): { removed: number; total: number } {
  const ids = new Set(paperIds.map((id) => String(id).trim()).filter(Boolean));
  const before = library.length;
  library = library.filter((p) => !ids.has(p.id));
  const removed = before - library.length;
  return { removed, total: library.length };
}

/** Update stored content for a paper (abstract, authors, pdfUrl, publishedYear, publishedDate, title). Used after arXiv fetch. */
export function updatePaperContent(
  paperId: string,
  content: {
    abstract?: string;
    authors?: string[];
    pdfUrl?: string;
    publishedYear?: string;
    publishedDate?: string;
    title?: string;
  }
): void {
  const id = String(paperId).trim();
  const i = library.findIndex((p) => p.id === id);
  if (i === -1) return;
  library[i] = {
    ...library[i],
    ...(content.abstract !== undefined && { abstract: content.abstract }),
    ...(content.authors !== undefined && { authors: content.authors }),
    ...(content.pdfUrl !== undefined && { pdfUrl: content.pdfUrl }),
    ...(content.publishedYear !== undefined && { publishedYear: content.publishedYear }),
    ...(content.publishedDate !== undefined && { publishedDate: content.publishedDate }),
    ...(content.title !== undefined && content.title && { title: content.title }),
  };
}

/** Set approved state for a paper (checkmark). */
export function setPaperApproved(paperId: string, approved: boolean): void {
  const id = String(paperId).trim();
  const i = library.findIndex((p) => p.id === id);
  if (i === -1) return;
  library[i] = { ...library[i], approved };
}

/** Reset library to empty. For testing only. */
export function resetLibrary(): void {
  library = [];
}
