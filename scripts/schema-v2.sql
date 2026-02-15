-- Schema v2: Projects support
-- Run this in Neon SQL Editor. It drops old tables and recreates with project scoping.
-- If you have data you want to keep, use migrate-to-v2.sql instead.

DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS library;
DROP TABLE IF EXISTS projects;

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Library: papers scoped to a project
CREATE TABLE library (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  paper_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  pdf_url TEXT,
  authors JSONB DEFAULT '[]',
  abstract TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_year TEXT,
  published_date DATE,
  approved BOOLEAN NOT NULL DEFAULT false,
  github_links JSONB DEFAULT '[]',
  PRIMARY KEY (project_id, paper_id)
);

CREATE INDEX library_project_added_idx ON library (project_id, added_at DESC);

-- Notes: scoped to a project, optionally linked to a paper
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  paper_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notes_project_updated_idx ON notes (project_id, updated_at DESC);
CREATE INDEX notes_paper_id_idx ON notes (paper_id);
