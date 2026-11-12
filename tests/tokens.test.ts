import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { consumeToken, createToken, findToken, pruneExpired, tokenId } from "@/lib/auth";
import { sessions, tokens } from "@/lib/db/schema";
import { createUser, db, resetDb } from "./db";

beforeEach(resetDb);

describe("one-time tokens", () => {
  it("accept a fractional lifetime", async () => {
    const user = await createUser("a@example.com");
    const raw = await createToken({ kind: "reset", email: user.email, userId: user.id, ttlHours: 0.5 });
    const row = await findToken("reset", raw);
    expect(row).not.toBeNull();
    expect((row!.expiresAt.getTime() - row!.createdAt.getTime()) / 60_000).toBeCloseTo(30, 0);
  });

  it("can be used once, and only as their own kind", async () => {
    const raw = await createToken({ kind: "invite", note: "Pepa", ttlHours: 1 });
    expect(await consumeToken("reset", raw)).toBeNull();
    expect(await consumeToken("invite", raw)).not.toBeNull();
    expect(await consumeToken("invite", raw)).toBeNull();
    expect(await findToken("invite", raw)).toBeNull();
  });

  it("can't be used after they expire", async () => {
    const raw = await createToken({ kind: "invite", note: "Pepa", ttlHours: -1 });
    expect(await findToken("invite", raw)).toBeNull();
    expect(await consumeToken("invite", raw)).toBeNull();
  });

  it("go to exactly one of several simultaneous requests", async () => {
    const raw = await createToken({ kind: "invite", note: "Pepa", ttlHours: 1 });
    const results = await Promise.all(Array.from({ length: 5 }, () => consumeToken("invite", raw)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("pruneExpired", () => {
  it("deletes expired sessions and tokens but keeps used invitations", async () => {
    const user = await createUser("a@example.com");
    await db.insert(sessions).values([
      { id: "expired", userId: user.id, expiresAt: sql`now() - interval '1 minute'` },
      { id: "live", userId: user.id, expiresAt: sql`now() + interval '1 day'` },
    ]);
    const unusedInvite = await createToken({ kind: "invite", note: "unused", ttlHours: -1 });
    const liveInvite = await createToken({ kind: "invite", note: "live", ttlHours: 1 });
    const usedInvite = await createToken({ kind: "invite", note: "used", ttlHours: 1 });
    await consumeToken("invite", usedInvite, { userId: user.id });
    const usedReset = await createToken({ kind: "reset", email: user.email, userId: user.id, ttlHours: 1 });
    await consumeToken("reset", usedReset);
    // Let the used ones expire too.
    await db.update(tokens).set({ expiresAt: sql`now() - interval '1 minute'` }).where(sql`${tokens.usedAt} is not null`);

    expect(await pruneExpired()).toEqual({ sessions: 1, tokens: 2 });
    expect((await db.select({ id: sessions.id }).from(sessions)).map((s) => s.id)).toEqual(["live"]);
    const left = (await db.select({ id: tokens.id }).from(tokens)).map((t) => t.id).sort();
    expect(left).toEqual([tokenId(liveInvite), tokenId(usedInvite)].sort());
    expect(left).not.toContain(tokenId(unusedInvite));
  });
});
