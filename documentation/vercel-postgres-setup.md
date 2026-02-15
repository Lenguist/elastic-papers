# Vercel Postgres (Neon) setup

The app uses **Neon** (serverless Postgres) for the library. When `POSTGRES_URL` or `DATABASE_URL` is set, the library is stored in the database. When not set, it falls back to in-memory (lost on restart).

---

## 1. Create the database

**Option A: From Vercel (recommended)**

1. Open your project on [Vercel](https://vercel.com).
2. Go to **Storage** (or **Integrations**).
3. Click **Create Database** / **Add Integration** and choose **Neon** (or “Postgres”).
4. Create a new Neon project and link it to your Vercel project.
5. Vercel will inject `POSTGRES_URL` (or `DATABASE_URL`) into your project env.

**Option B: From Neon directly**

1. Sign up at [neon.tech](https://neon.tech).
2. Create a project and copy the connection string.
3. Add it to your app as `POSTGRES_URL` or `DATABASE_URL` (see step 2).

---

## 2. Add the env var locally

Copy the connection string and add it to `.env` in the project root:

```bash
# Optional: use either name (app checks both)
POSTGRES_URL="postgresql://user:password@host/dbname?sslmode=require"
# or
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
```

For local dev, get the URL from the Vercel project **Settings → Environment Variables** (after linking Neon), or from the Neon dashboard.

---

## 3. Create the table

Run the schema once so the `library` table exists.

1. In the **Neon** dashboard, open your project and go to **SQL Editor**.
2. Paste and run the contents of **`scripts/schema.sql`** in this repo.

Or from the shell (if you have `psql` and the URL):

```bash
psql "$POSTGRES_URL" -f scripts/schema.sql
```

---

## 4. Deploy

On Vercel, `POSTGRES_URL` / `DATABASE_URL` is set automatically when the Neon integration is linked. Redeploy so the API routes use the DB.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Create Neon DB (via Vercel Storage/Integrations or neon.tech). |
| 2 | Set `POSTGRES_URL` or `DATABASE_URL` in Vercel and in local `.env`. |
| 3 | Run `scripts/schema.sql` in Neon SQL Editor (or via psql). |
| 4 | Deploy; library will persist across restarts. |

If the env var is not set, the app still runs and uses in-memory storage (no persistence).
