import type { Metadata } from "next";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { Suspense } from "react";
import { InviteForm } from "@/components/auth/InviteForm";
import { PageLoading } from "@/components/Loading";
import { revokeInvite } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { tokens, users } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Tým" };

const when = (d: Date) =>
  d.toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

async function Team() {
  const me = await requireUser();
  const [members, invites] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
      .from(users)
      .orderBy(asc(users.createdAt)),
    db
      .select({
        id: tokens.id,
        note: tokens.note,
        email: tokens.email,
        expiresAt: tokens.expiresAt,
        createdAt: tokens.createdAt,
        createdBy: users.name,
      })
      .from(tokens)
      .leftJoin(users, eq(users.id, tokens.createdById))
      .where(and(eq(tokens.kind, "invite"), isNull(tokens.usedAt), gt(tokens.expiresAt, sql`now()`)))
      .orderBy(desc(tokens.createdAt)),
  ]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 font-display text-xl font-bold">Členové ({members.length})</h2>
          <ul className="panel divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-3">
                <span className="font-semibold">{m.name}</span>
                <span className="text-sm text-muted">{m.email}</span>
                {m.id === me.id && <span className="text-xs text-gold">ty</span>}
                <span className="ml-auto text-xs text-faint">
                  od {m.createdAt.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" })}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-bold">Nevyužité pozvánky ({invites.length})</h2>
          {invites.length === 0 ? (
            <p className="text-sm text-faint">Žádné čekající pozvánky.</p>
          ) : (
            <ul className="panel divide-y divide-line">
              {invites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{inv.note || inv.email || "Bez poznámky"}</div>
                    <div className="text-xs text-faint">
                      {inv.email ? `e-mail ${inv.email} · ` : "odkaz · "}
                      vytvořil(a) {inv.createdBy ?? "?"} {when(inv.createdAt)} · platí do {when(inv.expiresAt)}
                    </div>
                  </div>
                  <form action={revokeInvite.bind(null, inv.id)}>
                    <button className="btn btn-danger px-2.5 py-1 text-xs">Zrušit</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="panel h-fit p-4">
        <h2 className="mb-1 font-display text-lg font-bold">Pozvat do týmu</h2>
        <p className="mb-4 text-sm text-muted">
          Vytvoř odkaz a pošli ho, kudy chceš, nebo ho rovnou odešli e-mailem. Pozvánka platí 7 dní a jde použít
          jen jednou.
        </p>
        <InviteForm />
      </aside>
    </div>
  );
}

export default function TeamPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="mb-6 font-display text-3xl font-bold">Tým</h1>
      <Suspense fallback={<PageLoading />}>
        <Team />
      </Suspense>
    </div>
  );
}
