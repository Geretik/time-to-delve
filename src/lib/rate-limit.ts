import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { rateLimits } from "./db/schema";

/**
 * Address of the caller. On Vercel `x-forwarded-for` is set by the platform and can't be
 * forged; when self-hosting, the reverse proxy must overwrite it for the limits to hold.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Counts one attempt and says whether it is still within the limit: at most `max` attempts
 * per `subject` in a window of `minutes` (the window starts with the first attempt).
 * A single upsert, so simultaneous requests can't slip past the limit. Expired rows are
 * reused here and deleted by the daily prune.
 */
export async function rateLimit(name: string, subject: string, max: number, minutes: number): Promise<boolean> {
  const key = createHash("sha256").update(`${name}:${subject}`).digest("hex");
  const expired = sql`${rateLimits.resetAt} <= now()`;
  const [{ count }] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: sql`now() + ${minutes}::float8 * interval '1 minute'` })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${expired} then excluded.reset_at else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return count <= max;
}

export const TOO_MANY = "Příliš mnoho pokusů. Zkus to prosím znovu později.";
