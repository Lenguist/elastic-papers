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

export function hasDb(): boolean {
  return Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

// ─── Projects ────────────────────────────────────────────────────────────────

export type ProjectRow = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
};

function rowToProject(row: Record<string, unknown>): ProjectRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    createdAt: row.created_at != null ? new Date(row.created_at as string).toISOString() : "",
  };
}

export async function dbListProjects(): Promise<ProjectRow[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`SELECT * FROM projects ORDER BY created_at DESC`;
  return (rows as Record<string, unknown>[]).map(rowToProject);
}

export async function dbGetProject(projectId: string): Promise<ProjectRow | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
  if (rows.length === 0) return null;
  return rowToProject(rows[0] as Record<string, unknown>);
}

export async function dbCreateProject(name: string, description: string): Promise<ProjectRow | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    INSERT INTO projects (name, description)
    VALUES (${name}, ${description})
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return rowToProject(rows[0] as Record<string, unknown>);
}

export async function dbDeleteProject(projectId: string): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  await sql`DELETE FROM projects WHERE id = ${projectId}`;
}

// ─── Library (project-scoped) ────────────────────────────────────────────────

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
    githubLinks: Array.isArray(row.github_links) ? (row.github_links as string[]) : undefined,
  };
}

export async function dbGetLibrary(projectId: string): Promise<LibraryPaper[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`SELECT * FROM library WHERE project_id = ${projectId} ORDER BY added_at DESC`;
  return (rows as Record<string, unknown>[]).map(rowToPaper);
}

export async function dbAddPapers(
  projectId: string,
  papers: Array<{ id: string; title?: string; url?: string; authors?: string[] }>
): Promise<{ added: LibraryPaper[]; total: number }> {
  const sql = getSql();
  if (!sql) return { added: [], total: 0 };

  const now = new Date().toISOString();
  const added: LibraryPaper[] = [];

  for (const p of papers) {
    const id = String(p?.id ?? "").trim();
    if (!id) continue;
    const existing = await sql`SELECT 1 FROM library WHERE project_id = ${projectId} AND paper_id = ${id}`;
    if (existing.length > 0) continue;

    const rawTitle = String(p?.title ?? "").trim();
    const title = rawTitle && !/^arXiv:\d+\.\d+/i.test(rawTitle) ? rawTitle : "Untitled";
    const url = p?.url ?? `https://arxiv.org/abs/${id}`;
    const pdfUrl = `https://arxiv.org/pdf/${id}.pdf`;
    const authors = Array.isArray(p?.authors) ? p.authors : [];

    try {
      await sql`
        INSERT INTO library (project_id, paper_id, title, url, pdf_url, authors, added_at, approved)
        VALUES (${projectId}, ${id}, ${title}, ${url}, ${pdfUrl}, ${JSON.stringify(authors)}::jsonb, ${now}, false)
      `;
      const rows = await sql`SELECT * FROM library WHERE project_id = ${projectId} AND paper_id = ${id}`;
      if (rows.length > 0) added.push(rowToPaper(rows[0] as Record<string, unknown>));
    } catch {
      // skip on error
    }
  }

  const all = await sql`SELECT 1 FROM library WHERE project_id = ${projectId}`;
  return { added, total: all.length };
}

export async function dbRemovePapers(projectId: string, paperIds: string[]): Promise<{ removed: number; total: number }> {
  const sql = getSql();
  if (!sql) return { removed: 0, total: 0 };

  const ids = [...new Set(paperIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) return { removed: 0, total: (await dbGetLibrary(projectId)).length };

  const before = (await sql`SELECT 1 FROM library WHERE project_id = ${projectId}`).length;
  for (const id of ids) {
    await sql`DELETE FROM library WHERE project_id = ${projectId} AND paper_id = ${id}`;
  }
  const after = (await sql`SELECT 1 FROM library WHERE project_id = ${projectId}`).length;
  return { removed: before - after, total: after };
}

export async function dbUpdatePaperContent(
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
  const sql = getSql();
  if (!sql) return;

  const id = String(paperId).trim();

  if (content.abstract !== undefined) {
    await sql`UPDATE library SET abstract = ${content.abstract} WHERE project_id = ${projectId} AND paper_id = ${id}`;
  }
  if (content.authors !== undefined) {
    await sql`UPDATE library SET authors = ${JSON.stringify(content.authors)}::jsonb WHERE project_id = ${projectId} AND paper_id = ${id}`;
  }
  if (content.pdfUrl !== undefined) {
    await sql`UPDATE library SET pdf_url = ${content.pdfUrl} WHERE project_id = ${projectId} AND paper_id = ${id}`;
  }
  if (content.publishedYear !== undefined) {
    await sql`UPDATE library SET published_year = ${content.publishedYear} WHERE project_id = ${projectId} AND paper_id = ${id}`;
  }
  if (content.publishedDate !== undefined) {
    await sql`UPDATE library SET published_date = ${content.publishedDate} WHERE project_id = ${projectId} AND paper_id = ${id}`;
  }
  if (content.title !== undefined && content.title) {
    await sql`UPDATE library SET title = ${content.title} WHERE project_id = ${projectId} AND paper_id = ${id}`;
  }
  if (content.githubLinks !== undefined) {
    await sql`UPDATE library SET github_links = ${JSON.stringify(content.githubLinks)}::jsonb WHERE project_id = ${projectId} AND paper_id = ${id}`;
  }
}

export async function dbSetPaperApproved(projectId: string, paperId: string, approved: boolean): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  const id = String(paperId).trim();
  await sql`UPDATE library SET approved = ${approved} WHERE project_id = ${projectId} AND paper_id = ${id}`;
}

// ─── Notes (project-scoped) ─────────────────────────────────────────────────

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

export async function dbGetNotes(projectId: string): Promise<NoteRow[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`SELECT id, content, paper_id, created_at, updated_at FROM notes WHERE project_id = ${projectId} ORDER BY updated_at DESC`;
  return (rows as Record<string, unknown>[]).map(rowToNote);
}

export async function dbCreateNote(projectId: string, content: string, paperId?: string | null): Promise<NoteRow | null> {
  const sql = getSql();
  if (!sql) return null;
  const now = new Date().toISOString();
  const pid = paperId && paperId.trim() ? paperId.trim() : null;
  const rows = await sql`
    INSERT INTO notes (project_id, content, paper_id, updated_at)
    VALUES (${projectId}, ${content}, ${pid}, ${now})
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
