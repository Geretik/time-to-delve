import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth";

export { db };

export async function resetDb() {
  await db.execute(sql`truncate users, sessions, tokens, cards, classes, rate_limits cascade`);
}

export async function createUser(email: string, name = "Tester") {
  const [user] = await db
    .insert(users)
    .values({ email, name, passwordHash: await hashPassword("heslo-heslo") })
    .returning();
  return user;
}

export function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
