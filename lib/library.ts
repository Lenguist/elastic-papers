import type { LibraryPaper } from "@/lib/library-store";
import * as memory from "@/lib/library-store";
import * as db from "@/lib/db";

export type { LibraryPaper };

export async function getLibrary(projectId: string): Promise<LibraryPaper[]> {
  if (db.hasDb()) return db.dbGetLibrary(projectId);
  return Promise.resolve(memory.getLibrary(projectId));
}

export async function addPapers(
  projectId: string,
  papers: Array<{ id: string; title?: string; url?: string; authors?: string[] }>
): Promise<{ added: LibraryPaper[]; total: number }> {
  if (db.hasDb()) return db.dbAddPapers(projectId, papers);
  const result = memory.addPapers(projectId, papers);
  return Promise.resolve(result);
}

export async function removePapers(projectId: string, paperIds: string[]): Promise<{ removed: number; total: number }> {
  if (db.hasDb()) return db.dbRemovePapers(projectId, paperIds);
  const result = memory.removePapers(projectId, paperIds);
  return Promise.resolve(result);
}

export async function updatePaperContent(
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
): Promise<void> {
  if (db.hasDb()) return db.dbUpdatePaperContent(projectId, paperId, content);
  memory.updatePaperContent(projectId, paperId, content);
  return Promise.resolve();
}

export async function setPaperApproved(projectId: string, paperId: string, approved: boolean): Promise<void> {
  if (db.hasDb()) return db.dbSetPaperApproved(projectId, paperId, approved);
  memory.setPaperApproved(projectId, paperId, approved);
  return Promise.resolve();
}
