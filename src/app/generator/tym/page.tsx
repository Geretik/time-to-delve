import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Suspense } from "react";
import { InviteForm } from "@/components/auth/InviteForm";
import { PageLoading } from "@/components/Loading";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Tým" };

async function Team() {
  const me = await requireUser();
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.createdAt));
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section>
        <h2 className="mb-3 font-display text-xl font-bold">Členové ({members.length})</h2>
        <ul className="panel divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-3">
              <span className="font-semibold">{m.name}</span>
              <span className="text-sm text-muted">{m.email}</span>
              {m.id === me.id && <span className="text-xs text-gold">ty</span>}
              <span className="ml-auto text-xs text-faint">od {m.createdAt.toLocaleDateString("cs-CZ")}</span>
            </li>
          ))}
        </ul>
      </section>
      <aside className="panel h-fit p-4">
        <h2 className="mb-1 font-display text-lg font-bold">Pozvat do týmu</h2>
        <p className="mb-4 text-sm text-muted">
          Pošleme e-mail s odkazem na registraci. Pozvánka platí 7 dní a jde použít jen jednou.
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
