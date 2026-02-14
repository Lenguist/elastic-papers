export type LibraryPaper = {
  id: string;
  title: string;
  url?: string;
  authors?: string[];
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
      if (!id) return null;
      return { id, title, url, authors: p?.authors };
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

/** Reset library to empty. For testing only. */
export function resetLibrary(): void {
  library = [];
}
