-- Library table for research atelier
-- Run this in Neon SQL Editor (Dashboard → SQL Editor) after creating the project.
-- No user_id for demo; add user_id later for auth.

CREATE TABLE IF NOT EXISTS library (
  paper_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  pdf_url TEXT,
  authors JSONB DEFAULT '[]',
  abstract TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_year TEXT,
  published_date DATE,
  approved BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS library_added_at_idx ON library (added_at DESC);

-- Notes table (no user_id for demo). paper_id links note to a library paper when set.
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL DEFAULT '',
  paper_id TEXT REFERENCES library(paper_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes (updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_paper_id_idx ON notes (paper_id);

-- If you already had a notes table without paper_id, run:
-- ALTER TABLE notes ADD COLUMN IF NOT EXISTS paper_id TEXT REFERENCES library(paper_id) ON DELETE SET NULL;
