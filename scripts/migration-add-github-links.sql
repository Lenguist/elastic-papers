-- Migration: Add github_links column to library table
-- Run this in Neon SQL Editor if you have an existing database

ALTER TABLE library ADD COLUMN IF NOT EXISTS github_links JSONB DEFAULT '[]';
