import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db, type Executor } from "./db";
import { sessions, tokens, users } from "./db/schema";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const COOKIE = "ttd_session";
const SESSION_DAYS = 30;

export type CurrentUser = { id: string; name: string; email: string };

// --- Time ----------------------------------------------------------------------
// Expiry is both written and checked with the database clock (`now()`), never with
// `new Date()` in JS:
//  - one clock for both sides, so app/DB clock skew can't make a fresh token look
//    expired (or keep an old one alive);
//  - reading the time in JS while rendering trips Cache Components' prerender check.
// Next can't see this time dependency, so don't put these lookups behind "use cache".

const dbNow = () => sql`now()`;
/** `hours` may be fractional: 0.5 is 30 minutes. */
const hoursFromNow = (hours: number) => sql`now() + ${hours}::float8 * interval '1 hour'`;

/**
 * Deletes expired sessions and tokens. Used invitations stay: they record who invited
 * whom (created_by_id → user_id). Run daily by Vercel Cron, see app/api/cron/prune.
 * The two deletes are independent, so one failing doesn't stop the other.
 */
export async function pruneExpired() {
  const [deletedSessions, deletedTokens] = await Promise.all([
    db.delete(sessions).where(lte(sessions.expiresAt, dbNow())).returning({ id: sessions.id }),
    db
      .delete(tokens)
      .where(and(lte(tokens.expiresAt, dbNow()), or(isNull(tokens.usedAt), eq(tokens.kind, "reset"))))
      .returning({ id: tokens.id }),
  ]);
  return { sessions: deletedSessions.length, tokens: deletedTokens.length };
}

// --- Passwords ---------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

// --- Sessions ----------------------------------------------------------------

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const [{ expiresAt }] = await db
    .insert(sessions)
    .values({ id: hashToken(token), userId, expiresAt: hoursFromNow(SESSION_DAYS * 24) })
    .returning({ expiresAt: sessions.expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  store.delete(COOKIE);
}

/**
 * Reads the session cookie. Returns null when nobody is signed in.
 * Deduplicated per render (layout, page and data getters share one query);
 * in Server Actions `cache` does nothing, so a fresh login is always seen.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, dbNow())))
    .limit(1);
  return row ?? null;
});

export async function destroyAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// --- One-time e-mail tokens ---------------------------------------------------

export type TokenKind = "reset" | "invite";

/** What makes a token usable: right kind, not used yet, not expired. The single source of that rule. */
export const activeToken = (kind: TokenKind) =>
  and(eq(tokens.kind, kind), isNull(tokens.usedAt), gt(tokens.expiresAt, dbNow()));

export async function createToken(opts: {
  kind: TokenKind;
  email?: string;
  note?: string;
  userId?: string;
  createdById?: string;
  ttlHours: number;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(tokens).values({
    id: hashToken(token),
    kind: opts.kind,
    email: opts.email,
    note: opts.note ?? "",
    userId: opts.userId,
    createdById: opts.createdById,
    expiresAt: hoursFromNow(opts.ttlHours),
  });
  return token;
}

/** Hash under which a token is stored (also the row id). */
export function tokenId(token: string) {
  return hashToken(token);
}

/** Valid (unused, unexpired) token row, without consuming it. */
export async function findToken(kind: TokenKind, token: string) {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(tokens)
    .where(and(eq(tokens.id, hashToken(token)), activeToken(kind)))
    .limit(1);
  return row ?? null;
}

/**
 * Uses up a token in one statement that also checks it's still valid, so two requests
 * can't both use it. Returns the token row, or null when the token is unknown, already
 * used, revoked (deleted from the team page) or expired.
 *  - `tx`: run inside a transaction; the token stays valid if the transaction fails.
 *  - `userId`: record the account an invitation created.
 */
export async function consumeToken(
  kind: TokenKind,
  token: string,
  opts: { tx?: Executor; userId?: string } = {},
) {
  if (!token) return null;
  const [row] = await (opts.tx ?? db)
    .update(tokens)
    .set({ usedAt: dbNow(), userId: opts.userId })
    .where(and(eq(tokens.id, hashToken(token)), activeToken(kind)))
    .returning();
  return row ?? null;
}

/** For pages and actions inside the generator: redirects to login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/prihlaseni");
  return user;
}
