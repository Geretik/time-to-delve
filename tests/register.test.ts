import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { register, resetPassword, revokeInvite } from "@/lib/actions/auth";
import { createSession, createToken, findToken, tokenId, verifyPassword } from "@/lib/auth";
import { tokens, users } from "@/lib/db/schema";
import { createUser, db, form, resetDb } from "./db";
import { Redirect } from "./next-fakes";

beforeEach(async () => {
  vi.stubEnv("INVITE_CODE", "");
  await resetDb();
});

const signUp = (fields: Record<string, string>) =>
  register(undefined, form({ name: "Nováček", password: "dlouhe-heslo", ...fields }));

const userCount = async () => (await db.select({ n: count() }).from(users))[0].n;

/** Runs the calls at the same time; returns [redirects, error messages]. */
async function race(...calls: Promise<unknown>[]) {
  const results = await Promise.allSettled(calls);
  const redirects = results.filter((r) => r.status === "rejected" && r.reason instanceof Redirect);
  const unexpected = results.find((r) => r.status === "rejected" && !(r.reason instanceof Redirect));
  if (unexpected) throw (unexpected as PromiseRejectedResult).reason;
  const errors = results.flatMap((r) => (r.status === "fulfilled" ? [(r.value as { error?: string }).error] : []));
  return [redirects.length, errors] as const;
}

describe("register", () => {
  it("lets the first account in without an invitation, nobody after it", async () => {
    await expect(signUp({ email: "prvni@example.com" })).rejects.toMatchObject({ to: "/generator" });
    expect(await signUp({ email: "druhy@example.com" })).toMatchObject({ error: expect.stringMatching(/jen na pozvánku/) });
    expect(await userCount()).toBe(1);
  });

  it("creates only one first account when two people register at once", async () => {
    const [ok, errors] = await race(signUp({ email: "a@example.com" }), signUp({ email: "b@example.com" }));
    expect(ok).toBe(1);
    expect(errors).toEqual([expect.stringMatching(/jen na pozvánku/)]);
    expect(await userCount()).toBe(1);
  });

  it("uses the shared INVITE_CODE when it's set", async () => {
    vi.stubEnv("INVITE_CODE", "tajne");
    expect(await signUp({ email: "a@example.com", invite: "spatne" })).toMatchObject({ error: "Neplatný zvací kód." });
    await expect(signUp({ email: "a@example.com", invite: "tajne" })).rejects.toBeInstanceOf(Redirect);
  });

  it("uses up the invitation and links it to the new account", async () => {
    const inviter = await createUser("zve@example.com");
    const raw = await createToken({ kind: "invite", note: "Pro Pepu", createdById: inviter.id, ttlHours: 24 });

    await expect(signUp({ email: "pepa@example.com", token: raw })).rejects.toBeInstanceOf(Redirect);

    const [pepa] = await db.select().from(users).where(eq(users.email, "pepa@example.com"));
    const [invite] = await db.select().from(tokens).where(eq(tokens.id, tokenId(raw)));
    expect(invite.usedAt).not.toBeNull();
    expect(invite.userId).toBe(pepa.id);
    expect(invite.createdById).toBe(inviter.id);
  });

  it("takes the e-mail address from an e-mail invitation", async () => {
    const raw = await createToken({ kind: "invite", email: "pozvany@example.com", ttlHours: 24 });
    await expect(signUp({ email: "jiny@example.com", token: raw })).rejects.toBeInstanceOf(Redirect);
    expect(await db.select({ email: users.email }).from(users)).toEqual([{ email: "pozvany@example.com" }]);
  });

  it("gives one invitation link to one person only, without leaving a half-made account", async () => {
    await createUser("zve@example.com");
    const raw = await createToken({ kind: "invite", note: "Odkaz", ttlHours: 24 });

    const [ok, errors] = await race(
      signUp({ email: "a@example.com", token: raw }),
      signUp({ email: "b@example.com", token: raw }),
    );
    expect(ok).toBe(1);
    expect(errors).toEqual([expect.stringMatching(/Pozvánka už neplatí/)]);
    expect(await userCount()).toBe(2);
  });

  it("keeps the invitation usable when registration fails", async () => {
    await createUser("pozvany@example.com");
    const raw = await createToken({ kind: "invite", email: "pozvany@example.com", ttlHours: 24 });
    expect(await signUp({ email: "x@example.com", token: raw })).toMatchObject({ error: expect.stringMatching(/už existuje/) });
    expect(await findToken("invite", raw)).not.toBeNull();
  });

  it("refuses a revoked invitation", async () => {
    const inviter = await createUser("zve@example.com");
    await createSession(inviter.id);
    const raw = await createToken({ kind: "invite", note: "Pepa", createdById: inviter.id, ttlHours: 24 });
    await revokeInvite(tokenId(raw));
    expect(await signUp({ email: "pepa@example.com", token: raw })).toMatchObject({ error: expect.stringMatching(/neplatná/) });
  });
});

describe("resetPassword", () => {
  it("sets the new password, and the link works only once", async () => {
    const user = await createUser("a@example.com");
    const raw = await createToken({ kind: "reset", email: user.email, userId: user.id, ttlHours: 1 });
    const reset = () => resetPassword(undefined, form({ token: raw, password: "nove-heslo-123" }));

    await expect(reset()).rejects.toMatchObject({ to: "/generator" });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(await verifyPassword("nove-heslo-123", row.passwordHash)).toBe(true);
    expect(await reset()).toMatchObject({ error: expect.stringMatching(/neplatný nebo vypršel/) });
  });
});
