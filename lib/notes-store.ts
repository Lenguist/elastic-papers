export type Note = {
  id: string;
  content: string;
  paperId: string | null;
  createdAt: string;
  updatedAt: string;
};

let notes: Note[] = [];
let idCounter = 0;

export function getNotes(): Note[] {
  return [...notes];
}

export function addNote(content: string, paperId?: string | null): Note {
  const now = new Date().toISOString();
  const id = `mem-${++idCounter}`;
  const note: Note = { id, content, paperId: paperId && paperId.trim() ? paperId.trim() : null, createdAt: now, updatedAt: now };
  notes = [note, ...notes];
  return note;
}

export function updateNote(id: string, content: string): void {
  const i = notes.findIndex((n) => n.id === id);
  if (i === -1) return;
  const now = new Date().toISOString();
  notes[i] = { ...notes[i], content, updatedAt: now };
}

export function deleteNote(id: string): void {
  notes = notes.filter((n) => n.id !== id);
}
