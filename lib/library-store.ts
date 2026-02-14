export type LibraryPaper = {
  id: string;
  title: string;
  url?: string;
  authors?: string[];
  abstract?: string;
  pdfUrl?: string;
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
  const normalized = papers
    .map((p) => {
      const id = String(p?.id ?? "").trim();
      const title = String(p?.title ?? "").trim() || `arXiv:${id}`;
      const url = p?.url ?? `https://arxiv.org/abs/${id}`;
      const pdfUrl = `https://arxiv.org/pdf/${id}.pdf`;
      if (!id) return null;
      return { id, title, url, pdfUrl, authors: p?.authors };
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

/** Update stored content for a paper (abstract, authors, pdfUrl). Used after arXiv fetch. */
export function updatePaperContent(
  paperId: string,
  content: { abstract?: string; authors?: string[]; pdfUrl?: string }
): void {
  const id = String(paperId).trim();
  const i = library.findIndex((p) => p.id === id);
  if (i === -1) return;
  library[i] = {
    ...library[i],
    ...(content.abstract !== undefined && { abstract: content.abstract }),
    ...(content.authors !== undefined && { authors: content.authors }),
    ...(content.pdfUrl !== undefined && { pdfUrl: content.pdfUrl }),
  };
}

/** Reset library to empty. For testing only. */
export function resetLibrary(): void {
  library = [];
}
