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
