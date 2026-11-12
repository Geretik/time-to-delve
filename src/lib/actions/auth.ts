"use server";

import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  consumeToken,
  createSession,
  createToken,
  destroyAllSessions,
  destroySession,
  findToken,
  hashPassword,
  requireUser,
  verifyPassword,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { appUrl, linkEmail, sendEmail } from "@/lib/email";

export type FormState =
  | { error?: string; message?: string; values?: Record<string, string> }
  | undefined;

const email = z.string().trim().toLowerCase().pipe(z.email("Zadej platný e-mail."));
const password = z.string().min(8, "Heslo musí mít aspoň 8 znaků.").max(200);

const values = (fd: FormData, ...keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));

// --- Login / logout ------------------------------------------------------------

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ email, password: z.string().min(1, "Zadej heslo.") })
    .safeParse(Object.fromEntries(formData));
  const keep = values(formData, "email");
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: keep };

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Nesprávný e-mail nebo heslo.", values: keep };
  }
  await createSession(user.id);
  redirect("/generator");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

// --- Registration ----------------------------------------------------------------

/**
 * Registration is invite-only. One of these must hold:
 *  - the e-mail invitation token is valid (the e-mail address is taken from it),
 *  - INVITE_CODE is set and matches,
 *  - there are no accounts yet (the first account sets the app up).
 */
export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const keep = values(formData, "name", "email", "invite");
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Zadej jméno.").max(60),
      email,
      password,
      invite: z.string().trim().optional(),
      token: z.string().trim().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: keep };
  const data = parsed.data;

  let inviteToken: Awaited<ReturnType<typeof findToken>> = null;
  if (data.token) {
    inviteToken = await findToken("invite", data.token);
    if (!inviteToken) return { error: "Pozvánka je neplatná nebo vypršela.", values: keep };
  } else if (process.env.INVITE_CODE) {
    if (data.invite !== process.env.INVITE_CODE) return { error: "Neplatný zvací kód.", values: keep };
  } else {
    const [{ n }] = await db.select({ n: count() }).from(users);
    if (n > 0) return { error: "Registrace je jen na pozvánku. Požádej někoho z týmu.", values: keep };
  }

  const userEmail = inviteToken?.email ?? data.email;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, userEmail)).limit(1);
  if (existing) return { error: "Účet s tímto e-mailem už existuje. Přihlas se.", values: keep };

  if (inviteToken && !(await consumeToken(inviteToken.id))) {
    return { error: "Pozvánka už byla použita.", values: keep };
  }

  const [user] = await db
    .insert(users)
    .values({ name: data.name, email: userEmail, passwordHash: await hashPassword(data.password) })
    .returning({ id: users.id });
  await createSession(user.id);
  redirect("/generator");
}

// --- Team invitations ---------------------------------------------------------

export async function inviteUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data)).limit(1);
  if (existing) return { error: "Tento člověk už účet má." };

  const token = await createToken({ kind: "invite", email: parsed.data, createdById: me.id, ttlHours: 24 * 7 });
  const url = `${await appUrl()}/registrace?pozvanka=${token}`;
  const sent = await sendEmail({
    to: parsed.data,
    subject: `${me.name} tě zve do generátoru karet Time to Delve`,
    ...linkEmail({
      heading: "Pozvánka do generátoru karet",
      intro: `${me.name} tě zve do týmového generátoru karet hry Time to Delve.`,
      cta: "Vytvořit účet",
      url,
      outro: "Pozvánka platí 7 dní. Pokud ji nečekáš, e-mail klidně ignoruj.",
    }),
  });
  if (!sent.ok) return { error: sent.error };
  return { message: `Pozvánka odeslána na ${parsed.data}.` };
}

// --- Password reset -----------------------------------------------------------

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: values(formData, "email") };

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data)).limit(1);
  if (user) {
    const token = await createToken({ kind: "reset", email: user.email, userId: user.id, ttlHours: 1 });
    const url = `${await appUrl()}/obnova-hesla?token=${token}`;
    const sent = await sendEmail({
      to: user.email,
      subject: "Obnova hesla – Time to Delve",
      ...linkEmail({
        heading: "Obnova hesla",
        intro: `Ahoj ${user.name}, někdo (snad ty) požádal o nové heslo do generátoru karet.`,
        cta: "Nastavit nové heslo",
        url,
        outro: "Odkaz platí 1 hodinu. Pokud jsi o změnu nežádal(a), e-mail ignoruj – heslo zůstane stejné.",
      }),
    });
    if (!sent.ok) return { error: sent.error, values: values(formData, "email") };
  }
  // Same answer whether or not the account exists, so the form can't be used to probe e-mails.
  return { message: "Pokud účet s tímto e-mailem existuje, poslali jsme na něj odkaz pro obnovu hesla." };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ token: z.string().min(1), password }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const row = await findToken("reset", parsed.data.token);
  if (!row?.userId || !(await consumeToken(row.id))) {
    return { error: "Odkaz je neplatný nebo vypršel. Požádej o nový." };
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, row.userId));
  await destroyAllSessions(row.userId);
  await createSession(row.userId);
  redirect("/generator");
}
