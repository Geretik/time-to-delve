/**
 * Backup of the database in DATABASE_URL (pg_dump, custom format):
 *
 *   npm run db:backup                        zalohy/ttd-<čas>.dump, zašifrovaná (.dump.enc), když je
 *                                            nastavené BACKUP_PASSPHRASE
 *   npm run db:backup -- --sifrovat          bez BACKUP_PASSPHRASE skončí chybou (denní GitHub Action)
 *   npm run db:backup -- --vystup <soubor>   jiný název souboru
 *
 * The backup holds classes, cards, accounts and drizzle's list of applied migrations. Sessions,
 * e-mail tokens and rate limits are short-lived, so only their tables are kept, not their rows.
 * Restore with npm run db:restore.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { databaseUrl, describeTarget, encrypt, runPgTool } from "./backup-lib";

const DUMP = [
  "pg_dump --format=custom --no-owner --no-privileges --no-statistics",
  "--schema=public --schema=drizzle",
  "--exclude-table-data=public.sessions --exclude-table-data=public.tokens --exclude-table-data=public.rate_limits",
  '"$PGURL"',
].join(" ");

function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const url = databaseUrl();
  const passphrase = process.env.BACKUP_PASSPHRASE || undefined;
  if (process.argv.includes("--sifrovat") && !passphrase) {
    throw new Error("Chybí BACKUP_PASSPHRASE – nezašifrovanou zálohu s --sifrovat nevytvořím.");
  }
  // 2026-11-14T03-00Z – no colons, so the name works on Windows too.
  const stamp = `${new Date().toISOString().slice(0, 16).replace(":", "-")}Z`;
  const out = option("--vystup") ?? `zalohy/ttd-${stamp}.dump${passphrase ? ".enc" : ""}`;

  console.log(`Zálohuji databázi ${describeTarget(url)}…`);
  const dump = await runPgTool(url, DUMP);
  const file = passphrase ? await encrypt(dump, passphrase) : dump;
  mkdirSync(dirname(out), { recursive: true });
  // Holds e-mails and password hashes: readable only by the owner.
  writeFileSync(out, file, { mode: 0o600 });
  console.log(`Hotovo: ${out} (${Math.ceil(file.length / 1024)} kB${passphrase ? ", zašifrováno" : ", nezašifrováno"}).`);
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
