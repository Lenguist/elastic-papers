# Data persistence: do you need a database?

## Short answer

**Elastic is not your app database.** Elastic is your **search index** (find papers, semantic search, what the agent queries). Your **library** and **notes** need a real store that persists and is keyed by user/session.

**Yes, you need a database** (or equivalent) for the library and notes if you want:
- Data to survive server restarts
- Multiple users with separate libraries
- No data loss when you deploy or scale

---

## Current setup

| Data | Where it lives | Persists? |
|------|----------------|-----------|
| **Library** (papers, approved, addedAt, etc.) | **Neon** (Postgres) when `POSTGRES_URL` or `DATABASE_URL` is set; otherwise in-memory fallback | Yes when DB is configured; no when using in-memory |
| **Notes** | Not implemented yet | – |
| **Search / papers index** | Elastic (Kibana agent, your search) | Yes – Elastic is the source for *finding* papers |

When the DB is connected, **delete** removes that paper from the database. Papers are independent (one row per paper). Setup: see **documentation/vercel-postgres-setup.md** (Neon via Vercel Marketplace).

---

## Elastic vs database

- **Elastic:** Use it for **search** – “find papers about X”, semantic search, agent queries. It’s the right place for the corpus of papers and retrieval.
- **Database (e.g. PostgreSQL, SQLite, Supabase):** Use it for **user/app state** – “this user’s library”, “this user’s notes”, approved flags, addedAt. That’s not what Elastic is for; a normal DB or key-value store is simpler and more reliable for that.

You can use both: Elastic for search, a DB for library + notes.

---

## What to add when you want persistence

1. **Pick a store:** e.g. SQLite (file), PostgreSQL, or Supabase (Postgres + auth). For a single user or demo, SQLite or a single JSON file is enough.
2. **Library:** Replace the in-memory array in `library-store.ts` with reads/writes to the DB (e.g. a `library` table: id, user_id/session_id, paper_id, title, url, added_at, approved, etc.). Keep the same API shape (GET/POST /api/library, remove, approve) so the frontend doesn’t change.
3. **Notes:** When you add notes, store them in the same DB (e.g. `notes` table) from the start.
4. **Optional: user identity** – If you have users, add a `user_id` (or session) so each user has their own library and notes.

Until then, the library and notes are “session” state: fine for a single-user demo, but not durable across restarts or deployments.
