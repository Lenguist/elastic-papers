#!/usr/bin/env node
/**
 * Quick check that Neon is reachable with POSTGRES_URL or DATABASE_URL.
 * Run from project root: node scripts/check-db.mjs
 * Loads .env from project root if vars are not set.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";

let url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) {
  try {
    const envPath = join(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^(POSTGRES_URL|DATABASE_URL)=(.*)$/);
      if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  } catch (_) {}
}
if (!url) {
  console.log("❌ No POSTGRES_URL or DATABASE_URL in env");
  process.exit(1);
}

try {
  const sql = neon(url);
  const rows = await sql`SELECT 1 as ok`;
  console.log("✅ Neon connection OK", rows);

  const count = await sql`SELECT count(*)::int as n FROM library`;
  console.log("📚 Library row count:", count[0]?.n ?? 0);
} catch (err) {
  console.log("❌ Error:", err.message);
  process.exit(1);
}
