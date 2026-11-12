import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/Loading";
import { CardLibrary } from "@/components/library/CardLibrary";
import { listCards, listClasses } from "@/lib/data";

export const metadata: Metadata = { title: "Karty" };

async function Library({ searchParams }: { searchParams: PageProps<"/generator">["searchParams"] }) {
  const [classes, cards, sp] = await Promise.all([listClasses(), listCards(), searchParams]);
  const initialClass = typeof sp.classa === "string" ? sp.classa : null;
  return (
    <CardLibrary
      classes={classes.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind, subgroups: c.subgroups }))}
      cards={cards.map((c) => ({ id: c.id, kind: c.kind, classId: c.classId, name: c.name, data: c.data }))}
      initialClass={initialClass}
    />
  );
}

export default function GeneratorHome(props: PageProps<"/generator">) {
  return (
    <Suspense fallback={<PageLoading label="Načítám karty…" />}>
      <Library searchParams={props.searchParams} />
    </Suspense>
  );
}
