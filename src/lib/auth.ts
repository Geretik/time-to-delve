import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "./db";
import { sessions, tokens, users } from "./db/schema";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const COOKIE = "ttd_session";
const SESSION_DAYS = 30;

export type CurrentUser = { id: string; name: string; email: string };

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
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
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

/** Reads the session cookie. Returns null when nobody is signed in. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function destroyAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// --- One-time e-mail tokens ---------------------------------------------------

type TokenKind = "reset" | "invite";

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
    expiresAt: new Date(Date.now() + opts.ttlHours * 60 * 60 * 1000),
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
    .where(
      and(
        eq(tokens.id, hashToken(token)),
        eq(tokens.kind, kind),
        isNull(tokens.usedAt),
        gt(tokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Marks the token as used. Returns false if someone used it in the meantime. */
export async function consumeToken(id: string): Promise<boolean> {
  const used = await db
    .update(tokens)
    .set({ usedAt: new Date() })
    .where(and(eq(tokens.id, id), isNull(tokens.usedAt)))
    .returning({ id: tokens.id });
  return used.length > 0;
}

/** For pages and actions inside the generator: redirects to login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/prihlaseni");
  return user;
}
