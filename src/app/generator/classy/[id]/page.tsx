import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClassForm } from "@/components/classes/ClassForm";
import { PageLoading } from "@/components/Loading";
import { deleteClass } from "@/lib/actions/classes";
import { getClass, listCards } from "@/lib/data";

export const metadata: Metadata = { title: "Classa" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ClassDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/generator/classy/[id]">["params"];
  searchParams: PageProps<"/generator/classy/[id]">["searchParams"];
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [cls, cards] = await Promise.all([getClass(id), listCards()]);
  if (!cls) notFound();
  const count = cards.filter((c) => c.classId === id).length;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="size-5 rounded-full ring-2 ring-black/30" style={{ background: cls.color }} />
        <h1 className="font-display text-3xl font-bold">{cls.name}</h1>
        <span className="text-sm text-muted">{cls.kind === "hero" ? "classa hrdiny" : "NPC skupina"}</span>
        <div className="ml-auto flex gap-2">
          <Link href={`/generator?classa=${cls.id}`} className="btn">
            Karty ({count})
          </Link>
          <Link href={`/generator/karty/nova?typ=${cls.kind === "npc" ? "npc" : "player"}&classa=${cls.id}`} className="btn btn-primary">
            + Nová karta
          </Link>
        </div>
      </div>

      {sp.chyba === "karty" && (
        <p role="alert" className="mb-4 rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">
          Classu nejde smazat, dokud k ní patří karty. Nejdřív je přesuň nebo smaž.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="panel p-4">
          <ClassForm
            key={cls.updatedAt.toISOString()}
            submitLabel="Uložit změny"
            initial={{
              id: cls.id,
              name: cls.name,
              kind: cls.kind,
              color: cls.color,
              hp: cls.hp,
              passive: cls.passive,
              description: cls.description,
              subgroups: cls.subgroups,
              sortOrder: cls.sortOrder,
            }}
          />
        </section>
        <aside className="space-y-4">
          {cls.passive && (
            <div className="panel p-4">
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Pasivní schopnost</h2>
              <p className="text-sm whitespace-pre-line text-bone/90">{cls.passive}</p>
            </div>
          )}
          <form action={deleteClass.bind(null, cls.id)} className="panel p-4">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Smazání</h2>
            <p className="mb-3 text-sm text-muted">
              {count > 0 ? `Ke classe patří ${count} karet – nejdřív je přesuň nebo smaž.` : "Classa nemá žádné karty."}
            </p>
            <button className="btn btn-danger" disabled={count > 0}>
              Smazat classu
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}

export default function ClassPage(props: PageProps<"/generator/classy/[id]">) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <Link href="/generator/classy" className="btn btn-ghost -ml-2 mb-2 px-2 text-muted">
        ← Classy
      </Link>
      <Suspense fallback={<PageLoading />}>
        <ClassDetail params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
