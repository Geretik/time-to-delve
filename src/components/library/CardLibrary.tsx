"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CardView } from "@/components/card/CardView";
import type { ClassOption } from "@/components/editor/CardEditor";
import type { CardKind } from "@/lib/cards";

type LibraryCard = { id: string; kind: CardKind; classId: string | null; name: string; data: unknown };

type Props = { classes: ClassOption[]; cards: LibraryCard[]; initialClass: string | null };

const GENERAL = "obecne";
const THUMB = 196;

function cardCodes(c: LibraryCard): string {
  const d = c.data as { top?: { code?: string }; bottom?: { code?: string }; code?: string };
  if (c.kind === "player") return [d.top?.code, d.bottom?.code].filter(Boolean).join(" / ");
  return d.code ?? "";
}

export function CardLibrary({ classes, cards, initialClass }: Props) {
  const [kind, setKind] = useState<"all" | CardKind>("all");
  const [classFilter, setClassFilter] = useState<string | null>(
    initialClass && (initialClass === GENERAL || classes.some((c) => c.id === initialClass)) ? initialClass : null,
  );
  const [query, setQuery] = useState("");

  const sections = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("cs");
    const match = (c: LibraryCard) =>
      (kind === "all" || c.kind === kind) &&
      (!q || c.name.toLocaleLowerCase("cs").includes(q) || cardCodes(c).toLocaleLowerCase("cs").includes(q));

    const groups = [
      ...classes.map((cls) => ({ key: cls.id, cls, cards: cards.filter((c) => c.classId === cls.id && match(c)) })),
      { key: GENERAL, cls: null, cards: cards.filter((c) => !c.classId && match(c)) },
    ];
    // Without a search, keep empty classes visible so a first card can be added from here.
    const fitsKind = (cls: ClassOption | null) =>
      kind === "all" || !cls || (kind === "player") === (cls.kind === "hero");
    return groups.filter((g) =>
      classFilter ? g.key === classFilter : g.cards.length > 0 || (!q && fitsKind(g.cls)),
    );
  }, [cards, classes, kind, classFilter, query]);

  const total = sections.reduce((n, s) => n + s.cards.length, 0);

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${
      active ? "border-gold bg-gold/15 text-bone" : "border-line text-muted hover:border-line-strong hover:text-bone"
    }`;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Karty</h1>
          <p className="text-sm text-muted">{total} karet</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href="/generator/karty/nova?typ=player" className="btn btn-primary">
            + Hráčská karta
          </Link>
          <Link href="/generator/karty/nova?typ=npc" className="btn">
            + NPC karta
          </Link>
        </div>
      </div>

      <div className="panel mb-6 space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-line p-0.5" role="group" aria-label="Typ karet">
            {(
              [
                ["all", "Vše"],
                ["player", "Hráčské"],
                ["npc", "NPC"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded px-3 py-1 text-sm font-semibold ${kind === k ? "bg-gold text-ink" : "text-muted hover:text-bone"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="field max-w-xs py-1.5"
            placeholder="Hledat název nebo kód…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Hledat"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(classFilter === null)} onClick={() => setClassFilter(null)}>
            Všechny classy
          </button>
          {classes.map((c) => (
            <button key={c.id} type="button" className={chip(classFilter === c.id)} onClick={() => setClassFilter(c.id)}>
              <span className="size-2.5 rounded-full" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
          <button type="button" className={chip(classFilter === GENERAL)} onClick={() => setClassFilter(GENERAL)}>
            Obecné
          </button>
        </div>
      </div>

      <div className="space-y-10">
        {sections.map(({ key, cls, cards: list }) => (
          <section key={key}>
            <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-line pb-2">
              <span className="h-6 w-1.5 rounded-full" style={{ background: cls?.color ?? "#8a857b" }} />
              <h2 className="font-display text-xl font-bold">{cls?.name ?? "Obecné karty"}</h2>
              <span className="text-xs text-faint">
                {cls ? (cls.kind === "hero" ? "classa hrdiny" : "NPC skupina") : "pro všechny"} · {list.length}
              </span>
              <div className="ml-auto flex gap-3 text-sm">
                {cls && (
                  <Link href={`/generator/classy/${cls.id}`} className="text-muted hover:text-bone">
                    Upravit {cls.kind === "hero" ? "classu" : "skupinu"}
                  </Link>
                )}
                <Link
                  href={`/generator/karty/nova?typ=${cls?.kind === "npc" ? "npc" : "player"}${cls ? `&classa=${cls.id}` : ""}`}
                  className="font-semibold text-gold hover:text-gold-strong"
                >
                  + Nová karta
                </Link>
              </div>
            </div>
            {list.length === 0 ? (
              <p className="text-sm text-faint">Zatím tu nejsou žádné karty.</p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-x-4 gap-y-6">
                {list.map((c) => (
                  <li key={c.id}>
                    <Link href={`/generator/karty/${c.id}`} className="group block">
                      <div className="mx-auto w-fit transition group-hover:-translate-y-1 group-hover:drop-shadow-[0_8px_18px_rgba(0,0,0,0.6)]">
                        <CardView
                          kind={c.kind}
                          name={c.name}
                          data={c.data}
                          classInfo={cls ? { name: cls.name, color: cls.color } : null}
                          width={THUMB}
                        />
                      </div>
                      <div className="mt-2 text-center">
                        <div className="truncate text-sm font-semibold group-hover:text-gold">{c.name}</div>
                        <div className="text-xs text-faint">{cardCodes(c) || (c.kind === "npc" ? "NPC" : "Hráčská")}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
