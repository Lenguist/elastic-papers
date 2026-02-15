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
  /** GitHub repository links found in the paper */
  githubLinks?: string[];
};

/** In-memory store keyed by projectId */
const store = new Map<string, LibraryPaper[]>();

function getOrCreate(projectId: string): LibraryPaper[] {
  if (!store.has(projectId)) store.set(projectId, []);
  return store.get(projectId)!;
}

export function getLibrary(projectId: string): LibraryPaper[] {
  return getOrCreate(projectId);
}

export function addPapers(
  projectId: string,
  papers: Array<{
    id: string;
    title?: string;
    url?: string;
    authors?: string[];
  }>
): { added: LibraryPaper[]; total: number } {
  const library = getOrCreate(projectId);
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
  store.set(projectId, [...library, ...toAdd]);
  return { added: toAdd, total: store.get(projectId)!.length };
}

export function removePapers(projectId: string, paperIds: string[]): { removed: number; total: number } {
  const library = getOrCreate(projectId);
  const ids = new Set(paperIds.map((id) => String(id).trim()).filter(Boolean));
  const before = library.length;
  const filtered = library.filter((p) => !ids.has(p.id));
  store.set(projectId, filtered);
  return { removed: before - filtered.length, total: filtered.length };
}

export function updatePaperContent(
  projectId: string,
  paperId: string,
  content: {
    abstract?: string;
    authors?: string[];
    pdfUrl?: string;
    publishedYear?: string;
    publishedDate?: string;
    title?: string;
    githubLinks?: string[];
  }
): void {
  const library = getOrCreate(projectId);
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
    ...(content.githubLinks !== undefined && { githubLinks: content.githubLinks }),
  };
}

export function setPaperApproved(projectId: string, paperId: string, approved: boolean): void {
  const library = getOrCreate(projectId);
  const id = String(paperId).trim();
  const i = library.findIndex((p) => p.id === id);
  if (i === -1) return;
  library[i] = { ...library[i], approved };
}
