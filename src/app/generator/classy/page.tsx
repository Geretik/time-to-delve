import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClassForm } from "@/components/classes/ClassForm";
import { PageLoading } from "@/components/Loading";
import { listCards, listClasses } from "@/lib/data";

export const metadata: Metadata = { title: "Classy" };

async function ClassList() {
  const [classes, cards] = await Promise.all([listClasses(), listCards()]);
  const counts = new Map<string, number>();
  for (const c of cards) if (c.classId) counts.set(c.classId, (counts.get(c.classId) ?? 0) + 1);
  const groups = [
    { title: "Classy hrdinů", items: classes.filter((c) => c.kind === "hero") },
    { title: "NPC skupiny", items: classes.filter((c) => c.kind === "npc") },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="mb-3 font-display text-xl font-bold">{g.title}</h2>
            {g.items.length === 0 ? (
              <p className="text-sm text-faint">Zatím žádné.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {g.items.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/generator/classy/${c.id}`}
                      className="panel flex items-start gap-3 p-4 transition hover:border-line-strong"
                    >
                      <span className="mt-1 size-4 shrink-0 rounded-full ring-2 ring-black/30" style={{ background: c.color }} />
                      <div className="min-w-0">
                        <div className="font-display text-lg font-bold">{c.name}</div>
                        <div className="text-xs text-muted">
                          {counts.get(c.id) ?? 0} karet
                          {c.hp != null && ` · ${c.hp} životů`}
                          {c.subgroups.length > 0 && ` · ${c.subgroups.join(", ")}`}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <aside className="panel h-fit p-4">
        <h2 className="mb-4 font-display text-lg font-bold">Nová classa / skupina</h2>
        <ClassForm
          submitLabel="Vytvořit"
          initial={{ name: "", kind: "hero", color: "#8a6f3c", hp: null, passive: "", description: "", subgroups: [], sortOrder: classes.length }}
        />
      </aside>
    </div>
  );
}

export default function ClassesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-bold">Classy</h1>
      <p className="mb-6 text-sm text-muted">
        Každá karta patří jedné classe hrdiny nebo NPC skupině – nebo je obecná pro všechny.
      </p>
      <Suspense fallback={<PageLoading />}>
        <ClassList />
      </Suspense>
    </div>
  );
}
