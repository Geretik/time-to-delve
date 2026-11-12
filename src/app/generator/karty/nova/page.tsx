import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/Loading";
import { CardEditor } from "@/components/editor/CardEditor";
import { emptyNpcData, emptyPlayerData } from "@/lib/cards";
import { listClasses } from "@/lib/data";

export const metadata: Metadata = { title: "Nová karta" };

async function NewCard({ searchParams }: { searchParams: PageProps<"/generator/karty/nova">["searchParams"] }) {
  const [classes, sp] = await Promise.all([listClasses(), searchParams]);
  const kind = sp.typ === "npc" ? "npc" : "player";
  const classId = typeof sp.classa === "string" && classes.some((c) => c.id === sp.classa) ? sp.classa : null;
  return (
    <CardEditor
      key={`${kind}-${classId}`}
      initial={{ kind, name: "", classId, data: kind === "npc" ? emptyNpcData() : emptyPlayerData() }}
      classes={classes.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind, subgroups: c.subgroups }))}
    />
  );
}

export default function NewCardPage(props: PageProps<"/generator/karty/nova">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewCard searchParams={props.searchParams} />
    </Suspense>
  );
}
