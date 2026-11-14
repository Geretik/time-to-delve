/**
 * Restores a backup made by npm run db:backup into DATABASE_URL:
 *
 *   npm run db:restore -- zalohy/ttd-2026-11-14T03-00Z.dump.enc
 *   npm run db:restore -- <soubor> --ano    bez potvrzení (do skriptů)
 *
 * The schemas public and drizzle are replaced by the backup in one transaction: everything written
 * since the backup is lost and everybody has to log in again. An encrypted backup needs BACKUP_PASSPHRASE.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Client } from "pg";
import { databaseName, databaseUrl, decrypt, describeTarget, isEncrypted, runPgTool } from "./backup-lib";

// The whole SQL is written out first, so a broken backup fails before anything is dropped. Dropping
// the schemas instead of pg_restore --clean also removes tables newer than the backup, whose foreign
// keys would otherwise block it; ON_ERROR_STOP rolls everything back on the first error.
const RESTORE = [
  "set -e",
  "cat > /tmp/zaloha.dump",
  "pg_restore --no-owner --no-privileges --no-statistics --file=/tmp/zaloha.sql /tmp/zaloha.dump",
  'psql --no-psqlrc --quiet --single-transaction -v ON_ERROR_STOP=1 --dbname="$PGURL" ' +
    "-c 'SET LOCAL client_min_messages = warning; DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE;' " +
    "-f /tmp/zaloha.sql",
].join("\n");

async function confirm(url: string) {
  if (process.argv.includes("--ano")) return;
  if (!process.stdin.isTTY) throw new Error("Obnovu je potřeba potvrdit. Bez terminálu přidej --ano.");
  const name = databaseName(url);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `Obnova přepíše data v databázi ${describeTarget(url)}. Pro potvrzení napiš její název (${name}): `,
  );
  rl.close();
  if (answer.trim() !== name) throw new Error("Nepotvrzeno, databáze zůstala beze změny.");
}

/** Migrations newer than the backup, which npm run db:migrate has to apply. */
async function missingMigrations(url: string): Promise<number> {
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>("select count(*)::int as n from drizzle.__drizzle_migrations");
    return journal.entries.length - rows[0].n;
  } finally {
    await client.end();
  }
}

async function main() {
  const path = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!path) throw new Error("Použití: npm run db:restore -- <soubor zálohy> [--ano]");
  const url = databaseUrl();

  let dump: Buffer = readFileSync(path);
  if (isEncrypted(dump)) {
    const passphrase = process.env.BACKUP_PASSPHRASE;
    if (!passphrase) throw new Error("Záloha je zašifrovaná, nastav BACKUP_PASSPHRASE.");
    dump = await decrypt(dump, passphrase);
  }
  if (!dump.subarray(0, 5).equals(Buffer.from("PGDMP"))) throw new Error("Soubor není záloha z npm run db:backup.");

  await confirm(url);
  console.log(`Obnovuji ${path} do ${describeTarget(url)}…`);
  await runPgTool(url, RESTORE, dump);

  const missing = await missingMigrations(url);
  console.log("Hotovo.");
  if (missing > 0) {
    console.log(`Záloha je starší než kód (chybí ${missing} ${missing >= 5 ? "migrací" : "migrace"}): spusť npm run db:migrate.`);
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
