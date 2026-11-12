import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/Loading";
import { CardEditor } from "@/components/editor/CardEditor";
import { parseNpcData, parsePlayerData } from "@/lib/cards";
import { getCard, listClasses } from "@/lib/data";

export const metadata: Metadata = { title: "Úprava karty" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function EditCard({ params }: { params: PageProps<"/generator/karty/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [card, classes] = await Promise.all([getCard(id), listClasses()]);
  if (!card) notFound();
  return (
    <CardEditor
      key={card.id}
      initial={{
        id: card.id,
        kind: card.kind,
        name: card.name,
        classId: card.classId,
        data: card.kind === "player" ? parsePlayerData(card.data) : parseNpcData(card.data),
      }}
      classes={classes.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind, subgroups: c.subgroups }))}
      meta={{ updatedAt: card.updatedAt.toISOString(), updatedBy: card.updatedBy }}
    />
  );
}

export default function EditCardPage(props: PageProps<"/generator/karty/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Načítám kartu…" />}>
      <EditCard params={props.params} />
    </Suspense>
  );
}
