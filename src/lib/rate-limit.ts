import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { rateLimits } from "./db/schema";

/**
 * Address of the caller, or null when it can't be told reliably.
 *  - On Vercel the platform overwrites `x-forwarded-for`, so its first entry is the client.
 *  - Self-hosted, set TRUSTED_PROXIES to the number of reverse proxies in front of the app:
 *    each one appends the address it saw, so the client is that many entries from the end
 *    (anything further left was sent by the client and can be made up).
 *  - Otherwise there is nothing to trust: Next fills the header in only when the client
 *    didn't send one. Per-address limits are then skipped rather than shared by everyone.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const hops = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (process.env.VERCEL) return hops[0] ?? null;
  const proxies = Number.parseInt(process.env.TRUSTED_PROXIES ?? "", 10);
  if (proxies > 0) return hops.at(-proxies) ?? null;
  warnUnknownIp();
  return null;
}

let warned = false;
function warnUnknownIp() {
  if (warned || process.env.NODE_ENV !== "production") return;
  warned = true;
  console.warn("Adresu klienta nelze spolehlivě zjistit – limity podle IP jsou vypnuté. Nastav TRUSTED_PROXIES.");
}

/** At most `max` attempts at once, refilled evenly so that `max` more fit in every `minutes`. */
export type Limit = { name: string; max: number; minutes: number };

const keyOf = (limit: Limit, subject: string) =>
  createHash("sha256").update(`${limit.name}:${subject}`).digest("hex");
const minutes = (n: number) => sql`${n}::float8 * interval '1 minute'`;
/** Time one attempt takes to "drain". */
const step = (limit: Limit) => limit.minutes / limit.max;

/**
 * Counts one attempt and says whether it is still within the limit. A null subject
 * (unknown address) is not limited.
 *
 * The row holds the moment the counter will be empty again; every allowed attempt pushes
 * it one step further, and an attempt is refused when that would reach more than `minutes`
 * ahead. So there is no window boundary to double the limit at: after a burst of `max`,
 * attempts come back one per step. Refused attempts aren't counted. A single upsert, so
 * simultaneous requests can't slip past. Drained rows are deleted by the daily prune.
 */
export async function rateLimit(limit: Limit, subject: string | null): Promise<boolean> {
  if (subject === null) return true;
  const next = sql`greatest(${rateLimits.resetAt}, now()) + ${minutes(step(limit))}`;
  // Half a step of slack keeps rounding and clock jitter between simultaneous
  // transactions from refusing the last allowed attempt; it never lets an extra one in.
  const horizon = sql`now() + ${minutes(limit.minutes + step(limit) / 2)}`;
  const allowed = await db
    .insert(rateLimits)
    .values({ key: keyOf(limit, subject), resetAt: sql`now() + ${minutes(step(limit))}` })
    .onConflictDoUpdate({ target: rateLimits.key, set: { resetAt: next }, setWhere: sql`${next} <= ${horizon}` })
    .returning({ key: rateLimits.key });
  return allowed.length > 0;
}

/** Gives one counted attempt back (it turned out not to be the kind the limit is for). */
export async function refundRateLimit(limit: Limit, subject: string | null) {
  if (subject === null) return;
  await db
    .update(rateLimits)
    .set({ resetAt: sql`${rateLimits.resetAt} - ${minutes(step(limit))}` })
    .where(eq(rateLimits.key, keyOf(limit, subject)));
}

/** Forgets all attempts of a subject. */
export async function clearRateLimit(limit: Limit, subject: string | null) {
  if (subject === null) return;
  await db.delete(rateLimits).where(eq(rateLimits.key, keyOf(limit, subject)));
}

export const TOO_MANY = "Příliš mnoho pokusů. Zkus to prosím znovu později.";
