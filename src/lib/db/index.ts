import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __ttdPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Chybí proměnná prostředí DATABASE_URL.");
  }
  return new Pool({
    connectionString,
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    idleTimeoutMillis: 10_000,
  });
}

// Reuse one pool across hot reloads in dev and across invocations on Vercel Fluid compute.
const pool = globalForDb.__ttdPool ?? createPool();
globalForDb.__ttdPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
