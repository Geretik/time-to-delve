/**
 * Fills an empty database with the classes and cards from podklady/Time to Delve.xlsx
 * (converted to src/lib/db/seed-data.json). Safe to run repeatedly: existing classes
 * (matched by slug) and existing cards (same name in the same class) are skipped.
 *
 *   npm run db:seed
 */
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { cards, classes } from "../src/lib/db/schema";

type Seed = {
  classes: (typeof classes.$inferInsert)[];
  cards: { kind: "player" | "npc"; classSlug: string; name: string; data: unknown }[];
};

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Nastav DATABASE_URL.");
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);
  const seed: Seed = JSON.parse(readFileSync(new URL("../src/lib/db/seed-data.json", import.meta.url), "utf8"));

  const ids = new Map<string, string>();
  let newClasses = 0;
  for (const c of seed.classes) {
    const [existing] = await db.select({ id: classes.id }).from(classes).where(eq(classes.slug, c.slug)).limit(1);
    if (existing) {
      ids.set(c.slug, existing.id);
      continue;
    }
    const [row] = await db.insert(classes).values(c).returning({ id: classes.id });
    ids.set(c.slug, row.id);
    newClasses++;
  }

  let newCards = 0;
  for (const card of seed.cards) {
    const classId = ids.get(card.classSlug)!;
    const [existing] = await db
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.classId, classId), eq(cards.name, card.name)))
      .limit(1);
    if (existing) continue;
    await db.insert(cards).values({ kind: card.kind, classId, name: card.name, data: card.data });
    newCards++;
  }

  console.log(`Přidáno ${newClasses} class a ${newCards} karet.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
