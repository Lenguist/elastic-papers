export type Note = {
  id: string;
  content: string;
  paperId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** In-memory notes store keyed by projectId */
const store = new Map<string, Note[]>();
let idCounter = 0;

function getOrCreate(projectId: string): Note[] {
  if (!store.has(projectId)) store.set(projectId, []);
  return store.get(projectId)!;
}

export function getNotes(projectId: string): Note[] {
  return [...getOrCreate(projectId)];
}

export function addNote(projectId: string, content: string, paperId?: string | null): Note {
  const notes = getOrCreate(projectId);
  const now = new Date().toISOString();
  const id = `mem-${++idCounter}`;
  const note: Note = { id, content, paperId: paperId && paperId.trim() ? paperId.trim() : null, createdAt: now, updatedAt: now };
  store.set(projectId, [note, ...notes]);
  return note;
}

export function updateNote(id: string, content: string): void {
  for (const notes of store.values()) {
    const i = notes.findIndex((n) => n.id === id);
    if (i !== -1) {
      notes[i] = { ...notes[i], content, updatedAt: new Date().toISOString() };
      return;
    }
  }
}

export function deleteNote(id: string): void {
  for (const [pid, notes] of store.entries()) {
    const filtered = notes.filter((n) => n.id !== id);
    if (filtered.length !== notes.length) {
      store.set(pid, filtered);
      return;
    }
  }
}
