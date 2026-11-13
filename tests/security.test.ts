import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { login, removeMember, requestPasswordReset, resetPassword } from "@/lib/actions/auth";
import { createSession, createToken, findToken, getCurrentUser } from "@/lib/auth";
import { rateLimits, sessions, tokens, users } from "@/lib/db/schema";
import { type Limit, clearRateLimit, clientIp, rateLimit, refundRateLimit } from "@/lib/rate-limit";
import { createUser, db, form, resetDb } from "./db";
import { afterDone, cookieJar, requestHeaders } from "./next-fakes";

beforeEach(resetDb);

const T: Limit = { name: "t", max: 3, minutes: 10 };

describe("rateLimit", () => {
  it("allows max attempts at once, per subject", async () => {
    for (let i = 0; i < 3; i++) expect(await rateLimit(T, "a")).toBe(true);
    expect(await rateLimit(T, "a")).toBe(false);
    expect(await rateLimit(T, "b")).toBe(true);
  });

  it("gives attempts back one by one, not all at a window boundary", async () => {
    const age = (minutes: number) =>
      db.update(rateLimits).set({ resetAt: sql`${rateLimits.resetAt} - ${minutes}::float8 * interval '1 minute'` });
    for (let i = 0; i < 3; i++) await rateLimit(T, "a");
    // A third of the 10 minutes later (and a bit) there is room for one more, not for three.
    await age(3.5);
    expect(await rateLimit(T, "a")).toBe(true);
    expect(await rateLimit(T, "a")).toBe(false);
    // Long after, it starts over.
    await age(60);
    for (let i = 0; i < 3; i++) expect(await rateLimit(T, "a")).toBe(true);
    expect(await rateLimit(T, "a")).toBe(false);
  });

  it("holds under simultaneous requests", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => rateLimit(T, "a")));
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("can give one attempt back or forget them all", async () => {
    for (let i = 0; i < 3; i++) await rateLimit(T, "a");
    await refundRateLimit(T, "a");
    expect(await rateLimit(T, "a")).toBe(true);
    expect(await rateLimit(T, "a")).toBe(false);
    await clearRateLimit(T, "a");
    for (let i = 0; i < 3; i++) expect(await rateLimit(T, "a")).toBe(true);
  });

  it("doesn't limit an unknown address", async () => {
    for (let i = 0; i < 5; i++) expect(await rateLimit(T, null)).toBe(true);
  });
});

describe("clientIp", () => {
  it("is unknown without a platform or proxy to vouch for the header", async () => {
    requestHeaders["x-forwarded-for"] = "1.1.1.1";
    expect(await clientIp()).toBeNull();
  });

  it("on Vercel is the first entry", async () => {
    vi.stubEnv("VERCEL", "1");
    requestHeaders["x-forwarded-for"] = "1.1.1.1, 10.0.0.1";
    expect(await clientIp()).toBe("1.1.1.1");
  });

  it("behind trusted proxies ignores what the client put in front", async () => {
    vi.stubEnv("TRUSTED_PROXIES", "1");
    requestHeaders["x-forwarded-for"] = "6.6.6.6, 2.2.2.2";
    expect(await clientIp()).toBe("2.2.2.2");
    vi.stubEnv("TRUSTED_PROXIES", "2");
    requestHeaders["x-forwarded-for"] = "6.6.6.6, 2.2.2.2, 10.0.0.1";
    expect(await clientIp()).toBe("2.2.2.2");
  });
});

describe("login", () => {
  const attempt = (password: string, email = "a@example.com") => login(undefined, form({ email, password }));
  const from = (ip: string) => {
    vi.stubEnv("VERCEL", "1");
    requestHeaders["x-forwarded-for"] = ip;
  };
  const wrong = { error: expect.stringMatching(/Nesprávný/) };
  const locked = { error: expect.stringMatching(/Příliš mnoho/) };
  const signedIn = { to: "/generator" };

  it("locks an account's login after 10 failures, even with the right password", async () => {
    await createUser("a@example.com");
    for (let i = 0; i < 10; i++) expect(await attempt("spatne")).toMatchObject(wrong);
    expect(await attempt("heslo-heslo")).toMatchObject(locked);
  });

  it("answers the same for an unknown account", async () => {
    expect(await attempt("x", "nikdo@example.com")).toMatchObject(wrong);
  });

  it("doesn't let a stranger at another address lock the owner out", async () => {
    await createUser("a@example.com");
    from("6.6.6.6");
    for (let i = 0; i < 10; i++) await attempt("spatne");
    expect(await attempt("heslo-heslo")).toMatchObject(locked);
    from("2.2.2.2");
    await expect(attempt("heslo-heslo")).rejects.toMatchObject(signedIn);
  });

  it("counts only failures", async () => {
    await createUser("a@example.com");
    await createUser("b@example.com");
    from("2.2.2.2");
    // Far more successful logins than any limit, from one (office) address.
    for (let i = 0; i < 35; i++) await expect(attempt("heslo-heslo")).rejects.toMatchObject(signedIn);
    // A success wipes the account's failures…
    for (let i = 0; i < 9; i++) await attempt("spatne");
    await expect(attempt("heslo-heslo")).rejects.toMatchObject(signedIn);
    for (let i = 0; i < 9; i++) expect(await attempt("spatne")).toMatchObject(wrong);
    // …but not the address's failures at other accounts.
    for (let i = 0; i < 10; i++) await attempt("spatne", "b@example.com");
    await expect(attempt("heslo-heslo")).rejects.toMatchObject(signedIn);
    expect(await attempt("heslo-heslo", "b@example.com")).toMatchObject(locked);
  });

  it("works again right after a password reset", async () => {
    const user = await createUser("a@example.com");
    for (let i = 0; i < 11; i++) await attempt("spatne");
    const token = await createToken({ kind: "reset", email: user.email, userId: user.id, ttlHours: 1 });
    await expect(resetPassword(undefined, form({ token, password: "nove-heslo-1" }))).rejects.toMatchObject(signedIn);
    await expect(attempt("nove-heslo-1")).rejects.toMatchObject(signedIn);
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
    // Nothing is looked up or sent before the response.
    expect(await resetTokens()).toHaveLength(0);
    for (let i = 0; i < 3; i++) await request("a@example.com");
    await afterDone();
    expect(await resetTokens()).toHaveLength(3);
  });

  it("doesn't hold a failed send against the next try", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const send = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await createUser("a@example.com");
    for (let i = 0; i < 5; i++) {
      await request("a@example.com");
      await afterDone();
    }
    expect(send).toHaveBeenCalledTimes(5);
    expect(await resetTokens()).toHaveLength(0);
  });

  it("says so when e-mail isn't set up, whoever asks", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    await createUser("a@example.com");
    const known = await request("a@example.com");
    expect(known).toMatchObject({ error: expect.stringMatching(/RESEND_API_KEY/) });
    expect(await request("nikdo@example.com")).toEqual({ ...known, values: { email: "nikdo@example.com" } });
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

  it("leaves one account when two members remove each other at once", async () => {
    const a = await createUser("a@example.com");
    const b = await createUser("b@example.com");
    const pause = () => new Promise((resolve) => setTimeout(resolve, 150));
    // Hold the accounts lock, so both requests get past the sign-in check and then wait.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ttd:accounts'))`);
      await held;
    });
    await pause();

    await createSession(a.id);
    const first = removeMember(b.id);
    await pause();
    cookieJar.clear();
    await createSession(b.id);
    const second = removeMember(a.id);
    await pause();

    release();
    await Promise.all([holder, first, second]);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("needs a signed-in user", async () => {
    const other = await createUser("on@example.com");
    cookieJar.clear();
    expect(await getCurrentUser()).toBeNull();
    await expect(removeMember(other.id)).rejects.toMatchObject({ to: "/prihlaseni" });
    expect(await db.select().from(users)).toHaveLength(1);
  });
});
