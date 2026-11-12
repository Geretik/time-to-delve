import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { login, removeMember, requestPasswordReset, resetPassword } from "@/lib/actions/auth";
import { createSession, createToken, findToken, getCurrentUser } from "@/lib/auth";
import { sessions, tokens, users } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { createUser, db, form, resetDb } from "./db";
import { afterDone, cookieJar } from "./next-fakes";

beforeEach(resetDb);

describe("rateLimit", () => {
  it("allows max attempts per window, per subject", async () => {
    for (let i = 0; i < 3; i++) expect(await rateLimit("t", "a", 3, 10)).toBe(true);
    expect(await rateLimit("t", "a", 3, 10)).toBe(false);
    expect(await rateLimit("t", "b", 3, 10)).toBe(true);
  });

  it("starts over when the window has passed", async () => {
    expect(await rateLimit("t", "a", 1, -1)).toBe(true);
    expect(await rateLimit("t", "a", 1, 10)).toBe(true);
    expect(await rateLimit("t", "a", 1, 10)).toBe(false);
  });

  it("holds under simultaneous requests", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => rateLimit("t", "a", 3, 10)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });
});

describe("login", () => {
  it("locks an account's login after 10 attempts, even with the right password", async () => {
    await createUser("a@example.com");
    const attempt = (password: string) => login(undefined, form({ email: "a@example.com", password }));
    for (let i = 0; i < 10; i++) expect(await attempt("spatne")).toMatchObject({ error: expect.stringMatching(/Nesprávný/) });
    expect(await attempt("heslo-heslo")).toMatchObject({ error: expect.stringMatching(/Příliš mnoho/) });
  });

  it("answers the same for an unknown account", async () => {
    expect(await login(undefined, form({ email: "nikdo@example.com", password: "x" }))).toMatchObject({
      error: expect.stringMatching(/Nesprávný/),
    });
  });
});

describe("password reset", () => {
  const request = (email: string) => requestPasswordReset(undefined, form({ email }));
  const resetTokens = () => db.select().from(tokens).where(eq(tokens.kind, "reset"));

  it("answers the same whether or not the account exists, and sends at most 3 e-mails an hour", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    await createUser("a@example.com");
    const known = await request("a@example.com");
    expect(known).toEqual(await request("nikdo@example.com"));
    expect(known?.message).toBeTruthy();
    for (let i = 0; i < 3; i++) await request("a@example.com");
    await afterDone();
    expect(await resetTokens()).toHaveLength(3);
  });

  it("invalidates the user's other reset links once one is used", async () => {
    const user = await createUser("a@example.com");
    const opts = { kind: "reset", email: user.email, userId: user.id, ttlHours: 1 } as const;
    const [first, second] = [await createToken(opts), await createToken(opts)];
    await expect(resetPassword(undefined, form({ token: first, password: "nove-heslo-1" }))).rejects.toMatchObject({
      to: "/generator",
    });
    expect(await findToken("reset", second)).toBeNull();
  });
});

describe("removeMember", () => {
  it("deletes the account, its sessions and its unused invitations; never yourself", async () => {
    const me = await createUser("ja@example.com");
    const other = await createUser("on@example.com");
    await createToken({ kind: "invite", note: "zadní vrátka", createdById: other.id, ttlHours: 24 });
    await createSession(other.id);
    await createSession(me.id);

    await removeMember(me.id);
    await removeMember("není-uuid");
    expect(await db.select().from(users)).toHaveLength(2);

    await removeMember(other.id);
    expect((await db.select().from(users)).map((u) => u.id)).toEqual([me.id]);
    expect(await db.select().from(tokens)).toHaveLength(0);
    expect((await db.select().from(sessions)).map((s) => s.userId)).toEqual([me.id]);
  });

  it("needs a signed-in user", async () => {
    const other = await createUser("on@example.com");
    cookieJar.clear();
    expect(await getCurrentUser()).toBeNull();
    await expect(removeMember(other.id)).rejects.toMatchObject({ to: "/prihlaseni" });
    expect(await db.select().from(users)).toHaveLength(1);
  });
});
