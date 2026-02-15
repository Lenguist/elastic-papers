import * as db from "@/lib/db";
import * as memory from "@/lib/notes-store";

export type Note = { id: string; content: string; paperId: string | null; createdAt: string; updatedAt: string };

export async function getNotes(): Promise<Note[]> {
  if (db.hasDb()) return db.dbGetNotes();
  return Promise.resolve(memory.getNotes());
}

export async function createNote(content: string, paperId?: string | null): Promise<Note | null> {
  if (db.hasDb()) return db.dbCreateNote(content, paperId);
  const note = memory.addNote(content, paperId);
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
