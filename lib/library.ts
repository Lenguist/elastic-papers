import type { LibraryPaper } from "@/lib/library-store";
import * as memory from "@/lib/library-store";
import * as db from "@/lib/db";

export type { LibraryPaper };

export async function getLibrary(): Promise<LibraryPaper[]> {
  if (db.hasDb()) return db.dbGetLibrary();
  return Promise.resolve(memory.getLibrary());
}

export async function addPapers(
  papers: Array<{ id: string; title?: string; url?: string; authors?: string[] }>
): Promise<{ added: LibraryPaper[]; total: number }> {
  if (db.hasDb()) return db.dbAddPapers(papers);
  const result = memory.addPapers(papers);
  return Promise.resolve(result);
}

export async function removePapers(paperIds: string[]): Promise<{ removed: number; total: number }> {
  if (db.hasDb()) return db.dbRemovePapers(paperIds);
  const result = memory.removePapers(paperIds);
  return Promise.resolve(result);
}

export async function updatePaperContent(
  paperId: string,
  content: {
    abstract?: string;
    authors?: string[];
    pdfUrl?: string;
    publishedYear?: string;
    publishedDate?: string;
    title?: string;
  }
): Promise<void> {
  if (db.hasDb()) return db.dbUpdatePaperContent(paperId, content);
  memory.updatePaperContent(paperId, content);
  return Promise.resolve();
}

export async function setPaperApproved(paperId: string, approved: boolean): Promise<void> {
  if (db.hasDb()) return db.dbSetPaperApproved(paperId, approved);
  memory.setPaperApproved(paperId, approved);
  return Promise.resolve();
}
