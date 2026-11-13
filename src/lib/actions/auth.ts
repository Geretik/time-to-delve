"use server";

import { and, count, eq, isNull, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import {
  activeToken,
  consumeToken,
  createSession,
  createToken,
  deleteResetTokens,
  destroyAllSessions,
  destroySession,
  findToken,
  hashPassword,
  requireUser,
  safeEqual,
  tokenId,
  verifyLogin,
} from "@/lib/auth";
import { db, type Executor } from "@/lib/db";
import { tokens, users } from "@/lib/db/schema";
import { appUrl, emailSetupError, linkEmail, sendEmail } from "@/lib/email";
import { isTokenId, isUuid } from "@/lib/ids";
import { TOO_MANY, type Limit, clearRateLimit, clientIp, rateLimit, refundRateLimit } from "@/lib/rate-limit";

export type FormState =
  | { error?: string; message?: string; values?: Record<string, string> }
  | undefined;

const email = z.string().trim().toLowerCase().pipe(z.email("Zadej platný e-mail."));
const password = z.string().min(8, "Heslo musí mít aspoň 8 znaků.").max(200);

const values = (fd: FormData, ...keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));

/**
 * Changes to who has an account (registration, removing a member) run one at a time, so
 * their checks can't race. Call first thing in the transaction; held until it ends.
 */
const lockAccounts = (tx: Executor) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('ttd:accounts'))`);

// --- Login / logout ------------------------------------------------------------

// Failed logins: per address against one machine guessing at many accounts; per account
// from one address, which is what locks a guesser out; and per account from anywhere,
// against a spread-out attack. The last one is deliberately loose – it is the only one
// a stranger can use to keep the owner out, and it takes many addresses to reach. Even then
// the owner gets in through the password reset, which signs in and clears these counters.
const LOGIN_IP: Limit = { name: "login-ip", max: 30, minutes: 15 };
const LOGIN_FROM_IP: Limit = { name: "login-email-ip", max: 10, minutes: 15 };
const LOGIN_ACCOUNT: Limit = { name: "login-email", max: 60, minutes: 15 };

const loginAttempts = (address: string, ip: string | null) => ({ fromIp: `${address}|${ip ?? ""}`, account: address });

async function forgetLoginAttempts(address: string, ip: string | null) {
  const attempts = loginAttempts(address, ip);
  await Promise.all([clearRateLimit(LOGIN_FROM_IP, attempts.fromIp), clearRateLimit(LOGIN_ACCOUNT, attempts.account)]);
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ email, password: z.string().min(1, "Zadej heslo.") })
    .safeParse(Object.fromEntries(formData));
  const keep = values(formData, "email");
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: keep };

  // Every attempt is counted before the password is checked (so a burst of simultaneous
  // guesses can't get ahead of the count) and a successful one is taken back below.
  const ip = await clientIp();
  const attempts = loginAttempts(parsed.data.email, ip);
  const allowed =
    (await rateLimit(LOGIN_IP, ip)) &&
    (await rateLimit(LOGIN_FROM_IP, attempts.fromIp)) &&
    (await rateLimit(LOGIN_ACCOUNT, attempts.account));
  if (!allowed) {
    return { error: `${TOO_MANY} Dovnitř se dostaneš i přes „Zapomenuté heslo“.`, values: keep };
  }

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!(await verifyLogin(parsed.data.password, user?.passwordHash)) || !user) {
    return { error: "Nesprávný e-mail nebo heslo.", values: keep };
  }
  // Only failures count: the owner starts clean, and the address gets its one attempt back
  // (not more – signing in to your own account mustn't buy fresh guesses at someone else's).
  await Promise.all([refundRateLimit(LOGIN_IP, ip), forgetLoginAttempts(user.email, ip)]);
  await createSession(user.id);
  redirect("/generator");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

// --- Registration ----------------------------------------------------------------

/** A reason to turn the registration down; thrown inside the transaction so it rolls back. */
class RegisterError extends Error {}

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
  if (!(await rateLimit({ name: "register-ip", max: 10, minutes: 60 }, await clientIp()))) return { error: TOO_MANY, values: keep };

  // Quick checks without a transaction. The invitation is only looked up here (for its
  // e-mail); it's used up below, together with creating the account.
  let userEmail = data.email;
  if (data.token) {
    const invite = await findToken("invite", data.token);
    if (!invite) return { error: "Pozvánka je neplatná nebo vypršela.", values: keep };
    userEmail = invite.email ?? data.email;
  } else if (process.env.INVITE_CODE) {
    if (!safeEqual(data.invite ?? "", process.env.INVITE_CODE)) return { error: "Neplatný zvací kód.", values: keep };
  }

  let userId: string;
  try {
    userId = await db.transaction(async (tx) => {
      // The checks below can't race (two "first" accounts on an empty database, two
      // sign-ups with the same e-mail).
      await lockAccounts(tx);

      if (!data.token && !process.env.INVITE_CODE) {
        const [{ n }] = await tx.select({ n: count() }).from(users);
        if (n > 0) throw new RegisterError("Registrace je jen na pozvánku. Požádej někoho z týmu.");
      }
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, userEmail)).limit(1);
      if (existing) throw new RegisterError("Účet s tímto e-mailem už existuje. Přihlas se.");

      const [user] = await tx
        .insert(users)
        .values({ name: data.name, email: userEmail, passwordHash: await hashPassword(data.password) })
        .returning({ id: users.id });
      // If the invitation can't be used any more, the throw rolls the new account back too.
      if (data.token && !(await consumeToken("invite", data.token, { tx, userId: user.id }))) {
        throw new RegisterError("Pozvánka už neplatí – mezitím ji někdo použil nebo zrušil, nebo vypršela.");
      }
      return user.id;
    });
  } catch (e) {
    if (e instanceof RegisterError) return { error: e.message, values: keep };
    throw e;
  }
  await createSession(userId);
  redirect("/generator");
}

// --- Team invitations ---------------------------------------------------------

export type InviteState = (NonNullable<FormState> & { link?: string }) | undefined;

const INVITE_DAYS = 7;

/**
 * Creates an invitation. The submit button decides how it's delivered:
 *  - mode=link  → returns the registration link to copy and share anywhere,
 *  - mode=email → sends the link by e-mail (and still returns it if sending fails).
 * The note says who the invitation is for; the raw link is shown only once.
 */
export async function createInvite(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const me = await requireUser();
  const mode = formData.get("mode") === "email" ? "email" : "link";
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  const rawEmail = String(formData.get("email") ?? "").trim();
  const values = { note, email: rawEmail };

  let address: string | undefined;
  if (rawEmail || mode === "email") {
    const parsed = email.safeParse(rawEmail);
    if (!parsed.success) return { error: parsed.error.issues[0].message, values };
    address = parsed.data;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, address)).limit(1);
    if (existing) return { error: "Tento člověk už účet má.", values };
  }
  if (!note && !address) return { error: "Napiš poznámku, pro koho pozvánka je.", values };

  const token = await createToken({
    kind: "invite",
    email: address,
    note,
    createdById: me.id,
    ttlHours: 24 * INVITE_DAYS,
  });
  const link = `${await appUrl()}/registrace?pozvanka=${token}`;
  refresh();

  if (mode === "link") {
    return { message: "Odkaz je připravený. Zkopíruj si ho – znovu už ho nezobrazíme.", link };
  }

  const sent = await sendEmail({
    to: address!,
    subject: `${me.name} tě zve do generátoru karet Time to Delve`,
    ...linkEmail({
      heading: "Pozvánka do generátoru karet",
      intro: `${me.name} tě zve do týmového generátoru karet hry Time to Delve.`,
      cta: "Vytvořit účet",
      url: link,
      outro: `Pozvánka platí ${INVITE_DAYS} dní. Pokud ji nečekáš, e-mail klidně ignoruj.`,
    }),
  });
  if (!sent.ok) {
    return { error: `${sent.error} Pozvánka ale vznikla – pošli odkaz ručně:`, link };
  }
  return { message: `Pozvánka odeslána na ${address}.` };
}

export async function revokeInvite(id: string) {
  await requireUser();
  if (!isTokenId(id)) return;
  await db.delete(tokens).where(and(eq(tokens.id, id), activeToken("invite")));
  refresh();
}

/**
 * Removes a team member: the account, its sessions (cascade) and the invitations it created
 * that nobody has used yet – otherwise it could let itself back in. Cards stay.
 * You can't remove yourself, so there is always at least one account left (an empty
 * database would open the registration to anyone). That only holds if whoever removes
 * still has an account when the removal happens – hence the lock and the second look:
 * two members removing each other at once end with one of them, not none.
 */
export async function removeMember(id: string) {
  const me = await requireUser();
  if (!isUuid(id) || id === me.id) return;
  await db.transaction(async (tx) => {
    await lockAccounts(tx);
    const [still] = await tx.select({ id: users.id }).from(users).where(eq(users.id, me.id)).limit(1);
    if (!still) return;
    await tx.delete(tokens).where(and(eq(tokens.createdById, id), eq(tokens.kind, "invite"), isNull(tokens.usedAt)));
    await tx.delete(users).where(eq(users.id, id));
  });
  refresh();
}

// --- Password reset -----------------------------------------------------------

const RESET_IP: Limit = { name: "reset-ip", max: 5, minutes: 60 };
// E-mails to one address, whoever asks. The link lives as long as this limit looks back, so
// whenever a request is turned down here, a link that still works is already in the mailbox
// – a stranger using the limit up can't keep the owner from resetting the password.
const RESET_EMAIL: Limit = { name: "reset-email", max: 3, minutes: 60 };
const RESET_LINK_HOURS = 1;

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = email.safeParse(formData.get("email"));
  const keep = values(formData, "email");
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: keep };
  const address = parsed.data;

  // Known without looking the account up, so saying it gives nothing away.
  const notSetUp = emailSetupError();
  if (notSetUp) return { error: notSetUp, values: keep };

  const ip = await clientIp();
  if (!(await rateLimit(RESET_IP, ip))) return { error: TOO_MANY, values: keep };
  // Over the per-address limit we stay silent, so the answer below doesn't change.
  if (await rateLimit(RESET_EMAIL, address)) {
    // Looking the account up and sending happen after the response: neither the answer nor
    // how long it takes says whether the account exists. That also means a failed send can't
    // be reported; it is logged, and the attempt isn't held against the next try.
    after(async () => {
      let tokenRow: string | undefined;
      try {
        const [user] = await db.select().from(users).where(eq(users.email, address)).limit(1);
        if (!user) return;
        const token = await createToken({ kind: "reset", email: user.email, userId: user.id, ttlHours: RESET_LINK_HOURS });
        tokenRow = tokenId(token);
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
        if (!sent.ok) throw new Error(sent.error);
      } catch (e) {
        console.error("Obnova hesla: e-mail se nepodařilo odeslat.", e);
        // Nothing reached the mailbox: drop the link nobody has and give the attempt back.
        await Promise.all([
          tokenRow && db.delete(tokens).where(eq(tokens.id, tokenRow)),
          refundRateLimit(RESET_EMAIL, address),
          refundRateLimit(RESET_IP, ip),
        ]).catch((cleanupError) => console.error("Obnova hesla: úklid po neúspěšném odeslání selhal.", cleanupError));
      }
    });
  }
  return {
    message:
      "Pokud účet s tímto e-mailem existuje, poslali jsme na něj odkaz pro obnovu hesla. " +
      "Kdyby nedorazil, podívej se i po dřívějším e-mailu – odkaz platí hodinu.",
  };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ token: z.string().min(1), password }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const ip = await clientIp();
  if (!(await rateLimit({ name: "reset-use-ip", max: 10, minutes: 60 }, ip))) return { error: TOO_MANY };

  const used = await consumeToken("reset", parsed.data.token);
  if (!used?.userId) return { error: "Odkaz je neplatný nebo vypršel. Požádej o nový." };
  const [user] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, used.userId))
    .returning({ email: users.email });
  // Other reset links still in the mailbox must not outlive the change.
  await deleteResetTokens(used.userId);
  await destroyAllSessions(used.userId);
  // Whoever holds the link owns the mailbox: earlier wrong passwords no longer count.
  if (user) await forgetLoginAttempts(user.email, ip);
  await createSession(used.userId);
  redirect("/generator");
}
