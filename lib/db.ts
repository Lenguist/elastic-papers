import path from "path";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import type { LibraryPaper } from "@/lib/library-store";

// Load .env if Next didn't (e.g. wrong cwd when starting dev server)
if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  config({ path: path.join(process.cwd(), ".env") });
}

function getSql() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

function rowToPaper(row: Record<string, unknown>): LibraryPaper {
  return {
    id: String(row.paper_id),
    title: String(row.title ?? ""),
    url: row.url != null ? String(row.url) : undefined,
    pdfUrl: row.pdf_url != null ? String(row.pdf_url) : undefined,
    authors: Array.isArray(row.authors) ? (row.authors as string[]) : undefined,
    abstract: row.abstract != null ? String(row.abstract) : undefined,
    addedAt: row.added_at != null ? new Date(row.added_at as string).toISOString() : undefined,
    publishedYear: row.published_year != null ? String(row.published_year) : undefined,
    publishedDate: row.published_date != null ? String(row.published_date) : undefined,
    approved: Boolean(row.approved),
  };
}

export async function dbGetLibrary(): Promise<LibraryPaper[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`SELECT * FROM library ORDER BY added_at DESC`;
  return (rows as Record<string, unknown>[]).map(rowToPaper);
}

export async function dbAddPapers(
  papers: Array<{ id: string; title?: string; url?: string; authors?: string[] }>
): Promise<{ added: LibraryPaper[]; total: number }> {
  const sql = getSql();
  if (!sql) return { added: [], total: 0 };

  const now = new Date().toISOString();
  const added: LibraryPaper[] = [];

  for (const p of papers) {
    const id = String(p?.id ?? "").trim();
    if (!id) continue;
    const existing = await sql`SELECT 1 FROM library WHERE paper_id = ${id}`;
    if (existing.length > 0) continue;

    const rawTitle = String(p?.title ?? "").trim();
    const title = rawTitle && !/^arXiv:\d+\.\d+/i.test(rawTitle) ? rawTitle : "Untitled";
    const url = p?.url ?? `https://arxiv.org/abs/${id}`;
    const pdfUrl = `https://arxiv.org/pdf/${id}.pdf`;
    const authors = Array.isArray(p?.authors) ? p.authors : [];

    try {
      await sql`
        INSERT INTO library (paper_id, title, url, pdf_url, authors, added_at, approved)
        VALUES (${id}, ${title}, ${url}, ${pdfUrl}, ${JSON.stringify(authors)}::jsonb, ${now}, false)
      `;
      const rows = await sql`SELECT * FROM library WHERE paper_id = ${id}`;
      if (rows.length > 0) added.push(rowToPaper(rows[0] as Record<string, unknown>));
    } catch {
      // skip on error
    }
  }

  const all = await sql`SELECT * FROM library ORDER BY added_at DESC`;
  return { added, total: all.length };
}

export async function dbRemovePapers(paperIds: string[]): Promise<{ removed: number; total: number }> {
  const sql = getSql();
  if (!sql) return { removed: 0, total: 0 };

  const ids = [...new Set(paperIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) return { removed: 0, total: (await dbGetLibrary()).length };

  const before = (await sql`SELECT 1 FROM library`).length;
  for (const id of ids) {
    await sql`DELETE FROM library WHERE paper_id = ${id}`;
  }
  const after = (await sql`SELECT 1 FROM library`).length;
  return { removed: before - after, total: after };
}

export async function dbUpdatePaperContent(
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
  const sql = getSql();
  if (!sql) return;

  const id = String(paperId).trim();

  if (content.abstract !== undefined) {
    await sql`UPDATE library SET abstract = ${content.abstract} WHERE paper_id = ${id}`;
  }
  if (content.authors !== undefined) {
    await sql`UPDATE library SET authors = ${JSON.stringify(content.authors)}::jsonb WHERE paper_id = ${id}`;
  }
  if (content.pdfUrl !== undefined) {
    await sql`UPDATE library SET pdf_url = ${content.pdfUrl} WHERE paper_id = ${id}`;
  }
  if (content.publishedYear !== undefined) {
    await sql`UPDATE library SET published_year = ${content.publishedYear} WHERE paper_id = ${id}`;
  }
  if (content.publishedDate !== undefined) {
    await sql`UPDATE library SET published_date = ${content.publishedDate} WHERE paper_id = ${id}`;
  }
  if (content.title !== undefined && content.title) {
    await sql`UPDATE library SET title = ${content.title} WHERE paper_id = ${id}`;
  }
}

export async function dbSetPaperApproved(paperId: string, approved: boolean): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  const id = String(paperId).trim();
  await sql`UPDATE library SET approved = ${approved} WHERE paper_id = ${id}`;
}

export function hasDb(): boolean {
  return Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

// --- Notes ---
export type NoteRow = {
  id: string;
  content: string;
  paperId: string | null;
  createdAt: string;
  updatedAt: string;
};

function rowToNote(row: Record<string, unknown>): NoteRow {
  return {
    id: String(row.id),
    content: String(row.content ?? ""),
    paperId: row.paper_id != null ? String(row.paper_id) : null,
    createdAt: row.created_at != null ? new Date(row.created_at as string).toISOString() : "",
    updatedAt: row.updated_at != null ? new Date(row.updated_at as string).toISOString() : "",
  };
}

export async function dbGetNotes(): Promise<NoteRow[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`SELECT id, content, paper_id, created_at, updated_at FROM notes ORDER BY updated_at DESC`;
  return (rows as Record<string, unknown>[]).map(rowToNote);
}

export async function dbCreateNote(content: string, paperId?: string | null): Promise<NoteRow | null> {
  const sql = getSql();
  if (!sql) return null;
  const now = new Date().toISOString();
  const pid = paperId && paperId.trim() ? paperId.trim() : null;
  const rows = await sql`
    INSERT INTO notes (content, paper_id, updated_at)
    VALUES (${content}, ${pid}, ${now})
    RETURNING id, content, paper_id, created_at, updated_at
  `;
  if (rows.length === 0) return null;
  return rowToNote(rows[0] as Record<string, unknown>);
}

export async function dbUpdateNote(id: string, content: string): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  const now = new Date().toISOString();
  await sql`UPDATE notes SET content = ${content}, updated_at = ${now} WHERE id = ${id}`;
}

export async function dbDeleteNote(id: string): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  await sql`DELETE FROM notes WHERE id = ${id}`;
}
