/**
 * Shared parts of `npm run db:backup` and `npm run db:restore`.
 *
 * pg_dump and pg_restore run from the official Postgres image: Docker is needed for local development
 * anyway, and the client must not be older than the server (Neon may run a newer Postgres than
 * whatever is installed locally). Backups that leave the machine are encrypted with a passphrase.
 */
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, scrypt, type ScryptOptions } from "node:crypto";
import { Client } from "pg";

/** The oldest client used; a newer server gets a client of its own version. */
const CLIENT_MAJOR = 18;

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Nastav DATABASE_URL.");
  return url;
}

/** "ttd na localhost:54329" – without the credentials. */
export function describeTarget(url: string): string {
  const u = new URL(url);
  return `${databaseName(url)} na ${u.host}`;
}

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

async function clientImage(url: string): Promise<string> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ major: number }>(
      "select current_setting('server_version_num')::int / 10000 as major",
    );
    return `postgres:${Math.max(CLIENT_MAJOR, rows[0].major)}-alpine`;
  } finally {
    await client.end();
  }
}

/**
 * Runs a Postgres client command in Docker and returns its output. The command reads the connection
 * string from $PGURL, so the password never appears on a command line.
 */
export async function runPgTool(url: string, command: string, input?: Buffer): Promise<Buffer> {
  const image = await clientImage(url);
  const target = new URL(url);
  // From inside the container, a database on this machine is reached through the Docker host.
  if (["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) target.hostname = "host.docker.internal";
  const args = ["run", "--rm", "-i", "--add-host=host.docker.internal:host-gateway", "-e", "PGURL", image, "sh", "-c", command];

  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      env: { ...process.env, PGURL: target.toString() },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (e) => reject(new Error(`Nejde spustit Docker (${e.message}). Je nainstalovaný a spuštěný?`)));
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`Příkaz v kontejneru ${image} skončil s chybou (kód ${code}), podrobnosti jsou výše.`));
    });
    child.stdin.end(input);
  });
}

// Encrypted backup: MAGIC | salt | iv | AES-256-GCM ciphertext | auth tag.
const MAGIC = Buffer.from("TTDZALOHA1");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
// About 0.3 s and 128 MiB per attempt, so guessing the passphrase is slow.
const SCRYPT: ScryptOptions = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const MIN_PASSPHRASE = 16;

function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(passphrase, salt, 32, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function encrypt(data: Buffer, passphrase: string): Promise<Buffer> {
  if (passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`BACKUP_PASSPHRASE musí mít aspoň ${MIN_PASSPHRASE} znaků (třeba openssl rand -base64 32).`);
  }
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", await deriveKey(passphrase, salt), iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, body, cipher.getAuthTag()]);
}

export function isEncrypted(file: Buffer): boolean {
  return file.subarray(0, MAGIC.length).equals(MAGIC);
}

export async function decrypt(file: Buffer, passphrase: string): Promise<Buffer> {
  const header = MAGIC.length + SALT_BYTES + IV_BYTES;
  if (!isEncrypted(file) || file.length < header + TAG_BYTES) throw new Error("Soubor není zašifrovaná záloha.");
  const salt = file.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = file.subarray(MAGIC.length + SALT_BYTES, header);
  const decipher = createDecipheriv("aes-256-gcm", await deriveKey(passphrase, salt), iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(file.subarray(file.length - TAG_BYTES));
  try {
    return Buffer.concat([decipher.update(file.subarray(header, file.length - TAG_BYTES)), decipher.final()]);
  } catch {
    throw new Error("Zálohu nejde rozšifrovat: špatné heslo, nebo je soubor poškozený.");
  }
}
