"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { cardInputSchema, type CardInput } from "@/lib/cards";
import { db } from "@/lib/db";
import { cards } from "@/lib/db/schema";

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveCard(input: CardInput): Promise<SaveResult> {
  const user = await requireUser();
  const parsed = cardInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, kind, name, classId, data } = parsed.data;

  if (id) {
    const updated = await db
      .update(cards)
      .set({ kind, name, classId, data, updatedById: user.id, updatedAt: new Date() })
      .where(eq(cards.id, id))
      .returning({ id: cards.id });
    if (updated.length === 0) return { ok: false, error: "Kartu mezitím někdo smazal." };
    refresh();
    return { ok: true, id };
  }

  const [created] = await db
    .insert(cards)
    .values({ kind, name, classId, data, createdById: user.id, updatedById: user.id })
    .returning({ id: cards.id });
  refresh();
  return { ok: true, id: created.id };
}

export async function duplicateCard(id: string) {
  const user = await requireUser();
  const [card] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
  if (!card) redirect("/generator");
  const [copy] = await db
    .insert(cards)
    .values({
      kind: card.kind,
      classId: card.classId,
      name: `${card.name} (kopie)`,
      data: card.data,
      createdById: user.id,
      updatedById: user.id,
    })
    .returning({ id: cards.id });
  redirect(`/generator/karty/${copy.id}`);
}

export async function deleteCard(id: string) {
  await requireUser();
  await db.delete(cards).where(eq(cards.id, id));
  redirect("/generator");
}
