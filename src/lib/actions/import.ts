"use server";

import { createHash } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { CardKind } from "@/lib/cards";
import { db, type Executor } from "@/lib/db";
import { cards, classes } from "@/lib/db/schema";
import { importInputSchema, planImport, type CardChange, type ImportPlan, type PlannedCard } from "@/lib/import/plan";
import { uniqueClassSlug } from "@/lib/slug";

// The browser reads the .xlsx and sends only the parsed tables (lib/import/excel.ts), so the
// upload stays far below the 1 MB Server Action limit. Everything is re-checked here.

export type ImportPreview = {
  newClasses: { name: string; kind: "hero" | "npc"; cards: number }[];
  cards: {
    sheet: string;
    row: number;
    kind: CardKind;
    name: string;
    className: string;
    status: PlannedCard["status"];
    cardId: string | null;
    changes: CardChange[];
    message: string | null;
  }[];
  /** Fingerprint of the whole plan; applyImport only writes when it still plans exactly this. */
  token: string;
};

export type PreviewResult = { ok: true; preview: ImportPreview } | { ok: false; error: string };
export type ApplyResult =
  | { ok: true; created: number; updated: number; classes: number }
  /** `preview`: the cards changed since the confirmed preview; this is what an import would do now. */
  | { ok: false; error: string; preview?: ImportPreview };

function parseInput(input: unknown) {
  const parsed = importInputSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const { path, message } = parsed.error.issues[0];
  console.error("Neplatná data importu:", path.join("."), message);
  return null;
}

async function loadPlan(tx: Executor, input: NonNullable<ReturnType<typeof parseInput>>) {
  // Ordered, so the same data always gives the same plan (and token).
  const [classRows, cardRows] = await Promise.all([
    tx
      .select({ id: classes.id, name: classes.name, kind: classes.kind, subgroups: classes.subgroups })
      .from(classes)
      .orderBy(asc(classes.sortOrder), asc(classes.createdAt), asc(classes.id)),
    tx
      .select({ id: cards.id, kind: cards.kind, classId: cards.classId, name: cards.name, data: cards.data })
      .from(cards)
      .orderBy(asc(cards.createdAt), asc(cards.id)),
  ]);
  return planImport(input, classRows, cardRows);
}

function toPreview(plan: ImportPlan): ImportPreview {
  return {
    newClasses: plan.newClasses.map((c) => ({
      name: c.name,
      kind: c.kind,
      cards: plan.cards.filter((p) => p.status === "create" && p.newClassKey === c.key).length,
    })),
    cards: plan.cards.map(({ sheet, row, kind, name, className, status, cardId, changes, message }) => ({
      sheet,
      row,
      kind,
      name,
      className,
      status,
      cardId,
      changes,
      message,
    })),
    token: createHash("sha256").update(JSON.stringify(plan)).digest("base64url"),
  };
}

const BAD_INPUT = "Data z Excelu se nepodařilo zpracovat. Zkus soubor načíst znovu.";

/** What importing the tables would do, without changing anything. */
export async function previewImport(input: unknown): Promise<PreviewResult> {
  await requireUser();
  const data = parseInput(input);
  if (!data) return { ok: false, error: BAD_INPUT };
  try {
    return { ok: true, preview: toPreview(await loadPlan(db, data)) };
  } catch (e) {
    console.error("Náhled importu z Excelu selhal:", e);
    return { ok: false, error: "Karty z generátoru se nepodařilo načíst. Zkus to znovu." };
  }
}

/**
 * Creates and updates the cards (and missing classes) in one transaction, provided that's still
 * what the preview with `token` showed.
 */
export async function applyImport(input: unknown, token: unknown): Promise<ApplyResult> {
  const user = await requireUser();
  const data = parseInput(input);
  if (!data || typeof token !== "string") return { ok: false, error: BAD_INPUT };

  type Outcome = { stale: ImportPreview } | { created: number; updated: number; classes: number };
  let outcome: Outcome;
  try {
    outcome = await db.transaction(async (tx): Promise<Outcome> => {
      // One import at a time: a second one waits here and then plans against the first one's cards,
      // instead of creating the same new cards again.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('import-z-excelu'))`);
      const plan = await loadPlan(tx, data);
      const preview = toPreview(plan);
      if (preview.token !== token) return { stale: preview };

      const existing = await tx.select({ slug: classes.slug, sortOrder: classes.sortOrder }).from(classes);
      const slugs = new Set(existing.map((c) => c.slug));
      let sortOrder = Math.max(-1, ...existing.map((c) => c.sortOrder)) + 1;
      const classIds = new Map<string, string>();
      for (const c of plan.newClasses) {
        const slug = uniqueClassSlug(c.name, slugs);
        slugs.add(slug);
        const [row] = await tx
          .insert(classes)
          .values({
            slug,
            name: c.name,
            kind: c.kind,
            hp: c.hp,
            passive: c.passive,
            description: c.description,
            subgroups: c.subgroups,
            sortOrder: sortOrder++,
          })
          .returning({ id: classes.id });
        classIds.set(c.key, row.id);
      }

      const created = plan.cards.filter((c) => c.status === "create");
      if (created.length > 0) {
        await tx.insert(cards).values(
          created.map((c) => ({
            kind: c.kind,
            classId: c.classId ?? classIds.get(c.newClassKey!)!,
            name: c.name,
            data: c.data!,
            createdById: user.id,
            updatedById: user.id,
          })),
        );
      }

      const updated = plan.cards.filter((c) => c.status === "update");
      for (const c of updated) {
        await tx
          .update(cards)
          .set({ name: c.name, data: c.data!, updatedById: user.id, updatedAt: new Date() })
          .where(eq(cards.id, c.cardId!));
      }

      return { created: created.length, updated: updated.length, classes: plan.newClasses.length };
    });
  } catch (e) {
    console.error("Import z Excelu selhal:", e);
    return { ok: false, error: "Import se nepovedl, nic se nezměnilo. Zkus to znovu." };
  }
  if ("stale" in outcome) {
    return {
      ok: false,
      error: "Karty v generátoru se mezitím změnily, takže se nic neuložilo. Náhled níž už je aktuální – zkontroluj ho a potvrď import znovu.",
      preview: outcome.stale,
    };
  }
  refresh();
  return { ok: true, ...outcome };
}
