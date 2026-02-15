import path from "path";
import { existsSync } from "fs";
import { config } from "dotenv";
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * GET /api/health — Check if the app is using the DB and if Neon is reachable.
 * Open in browser or: curl http://localhost:3000/api/health
 */
export async function GET() {
  const cwd = process.cwd();
  const envPaths = [
    path.join(cwd, ".env"),
    path.join(cwd, ".env.local"),
    path.resolve(cwd, ".env"),
  ];

  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    for (const envPath of envPaths) {
      if (existsSync(envPath)) {
        const result = config({ path: envPath, override: true });
        if (result.parsed && (result.parsed.POSTGRES_URL || result.parsed.DATABASE_URL)) break;
      }
    }
  }

  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) {
    // Next.js may not expose env vars to API routes unless they're in next.config
    const tried = envPaths.map((p) => ({ path: p, exists: existsSync(p) }));
    let parsedKeys: string[] = [];
    for (const envPath of envPaths) {
      if (existsSync(envPath)) {
        const result = config({ path: envPath, override: true });
        if (result.parsed) parsedKeys = Object.keys(result.parsed);
        break;
      }
    }
    return NextResponse.json({
      ok: true,
      db: "not_configured",
      message:
        "No POSTGRES_URL or DATABASE_URL. Library uses in-memory storage (data is lost on restart).",
      hint: "Add POSTGRES_URL or DATABASE_URL to .env in the project root, then restart the dev server (npm run dev).",
      debug: {
        cwd,
        tried,
        hasPostgresUrl: !!process.env.POSTGRES_URL,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        parsedKeysFromEnv: parsedKeys.filter((k) => k.includes("POSTGRES") || k.includes("DATABASE")),
      },
    });
  }

  try {
    const sql = neon(url);
    await sql`SELECT 1`;
    const countResult = await sql`SELECT count(*)::int as n FROM library`;
    const count = countResult[0]?.n ?? 0;
    return NextResponse.json({
      ok: true,
      db: "connected",
      libraryRows: count,
      message: "Neon is connected. Library table exists.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        db: "error",
        message: "Neon connection or table failed: " + message,
      },
      { status: 503 }
    );
  }
}
