import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { activeToken, requireUser } from "./auth";
import { db } from "./db";
import { cards, classes, tokens, users } from "./db/schema";

// Every getter re-checks the session, so a page can't leak data by forgetting to.

export async function listClasses() {
  await requireUser();
  return db.select().from(classes).orderBy(asc(classes.sortOrder), asc(classes.name));
}

export async function getClass(id: string) {
  await requireUser();
  const [row] = await db.select().from(classes).where(eq(classes.id, id)).limit(1);
  return row ?? null;
}

export async function listCards() {
  await requireUser();
  return db
    .select({
      id: cards.id,
      kind: cards.kind,
      classId: cards.classId,
      name: cards.name,
      data: cards.data,
      updatedAt: cards.updatedAt,
    })
    .from(cards)
    .orderBy(asc(cards.name));
}

export async function getCard(id: string) {
  await requireUser();
  const [row] = await db
    .select({
      id: cards.id,
      kind: cards.kind,
      classId: cards.classId,
      name: cards.name,
      data: cards.data,
      updatedAt: cards.updatedAt,
      updatedBy: users.name,
    })
    .from(cards)
    .leftJoin(users, eq(users.id, cards.updatedById))
    .where(eq(cards.id, id))
    .limit(1);
  return row ?? null;
}

export async function recentCards(limit = 6) {
  await requireUser();
  return db
    .select({ id: cards.id, name: cards.name, kind: cards.kind, classId: cards.classId, updatedAt: cards.updatedAt })
    .from(cards)
    .orderBy(desc(cards.updatedAt))
    .limit(limit);
}

// --- Team ---------------------------------------------------------------------

export async function listMembers() {
  await requireUser();
  return db
    .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.createdAt));
}

/** Invitations that can still be used, newest first. */
export async function listActiveInvites() {
  await requireUser();
  return db
    .select({
      id: tokens.id,
      note: tokens.note,
      email: tokens.email,
      expiresAt: tokens.expiresAt,
      createdAt: tokens.createdAt,
      createdBy: users.name,
    })
    .from(tokens)
    .leftJoin(users, eq(users.id, tokens.createdById))
    .where(activeToken("invite"))
    .orderBy(desc(tokens.createdAt));
}
