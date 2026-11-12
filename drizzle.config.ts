import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Local development reads .env.local; on Vercel the variables come from the project settings.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations should bypass the connection pooler when one is available (Neon).
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
