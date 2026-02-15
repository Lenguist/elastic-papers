-- Run in Neon SQL Editor if you already had a notes table without paper_id.
-- This adds the column so notes can be linked to library papers.

ALTER TABLE notes ADD COLUMN IF NOT EXISTS paper_id TEXT;

-- Optional: link to library (only run if you want referential integrity)
-- ALTER TABLE notes ADD CONSTRAINT notes_paper_id_fkey
--   FOREIGN KEY (paper_id) REFERENCES library(paper_id) ON DELETE SET NULL;
