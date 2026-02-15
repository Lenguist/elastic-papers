import path from "path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// Load .env so POSTGRES_URL/DATABASE_URL are available in API routes
config({ path: path.join(__dirname, ".env") });

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "."),
  // Expose env to server (Next may not expose all .env vars by default in some setups)
  env: {
    POSTGRES_URL: process.env.POSTGRES_URL,
    DATABASE_URL: process.env.DATABASE_URL,
  },
};

export default nextConfig;
