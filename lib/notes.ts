import * as db from "@/lib/db";
import * as memory from "@/lib/notes-store";

export type Note = { id: string; content: string; paperId: string | null; createdAt: string; updatedAt: string };

export async function getNotes(projectId: string): Promise<Note[]> {
  if (db.hasDb()) return db.dbGetNotes(projectId);
  return Promise.resolve(memory.getNotes(projectId));
}

export async function createNote(projectId: string, content: string, paperId?: string | null): Promise<Note | null> {
  if (db.hasDb()) return db.dbCreateNote(projectId, content, paperId);
  const note = memory.addNote(projectId, content, paperId);
  return Promise.resolve(note);
}

export async function updateNote(id: string, content: string): Promise<void> {
  if (db.hasDb()) return db.dbUpdateNote(id, content);
  memory.updateNote(id, content);
  return Promise.resolve();
}

export async function deleteNote(id: string): Promise<void> {
  if (db.hasDb()) return db.dbDeleteNote(id);
  memory.deleteNote(id);
  return Promise.resolve();
}
