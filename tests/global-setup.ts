import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

/** Creates the test database if needed, wipes it and applies the migrations from drizzle/. */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const name = url.pathname.slice(1);
  if (!/^\w+_test$/.test(name)) {
    throw new Error(`TEST_DATABASE_URL must point to a database named *_test (got "${name}"); it gets wiped.`);
  }

  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).href });
  await admin.connect();
  const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [name]);
  if (!rowCount) await admin.query(`create database "${name}"`);
  await admin.end();

  const client = new Client({ connectionString: url.href });
  await client.connect();
  await client.query("drop schema if exists drizzle cascade; drop schema public cascade; create schema public");
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  await client.end();
}
