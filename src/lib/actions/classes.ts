"use server";

import { count, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { cards, classes } from "@/lib/db/schema";
import { isUuid } from "@/lib/ids";
import { uniqueClassSlug } from "@/lib/slug";

export type ClassFormState = { error?: string; saved?: boolean } | undefined;

const classSchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(1, "Zadej název.").max(60),
  kind: z.enum(["hero", "npc"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Barva musí být ve tvaru #rrggbb."),
  hp: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(0).max(999).nullable()),
  passive: z.string().max(4000),
  description: z.string().max(4000),
  subgroups: z
    .string()
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6)),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export async function saveClass(_prev: ClassFormState, formData: FormData): Promise<ClassFormState> {
  await requireUser();
  const parsed = classSchema.safeParse({
    sortOrder: "0",
    passive: "",
    description: "",
    subgroups: "",
    hp: "",
    ...Object.fromEntries(formData),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...values } = parsed.data;

  if (id) {
    await db.update(classes).set({ ...values, updatedAt: new Date() }).where(eq(classes.id, id));
    refresh();
    return { saved: true };
  }

  const taken = await db.select({ slug: classes.slug }).from(classes);
  const slug = uniqueClassSlug(values.name, new Set(taken.map((c) => c.slug)));
  const [created] = await db.insert(classes).values({ ...values, slug }).returning({ id: classes.id });
  redirect(`/generator/classy/${created.id}`);
}

export async function deleteClass(id: string) {
  await requireUser();
  if (!isUuid(id)) redirect("/generator/classy");
  const [{ n }] = await db.select({ n: count() }).from(cards).where(eq(cards.classId, id));
  if (n > 0) {
    // Cards would silently become "obecné" – make the user move or delete them first.
    redirect(`/generator/classy/${id}?chyba=karty`);
  }
  await db.delete(classes).where(eq(classes.id, id));
  redirect("/generator/classy");
}
