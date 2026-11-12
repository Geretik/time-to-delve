"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { CardView, type FaceSide } from "@/components/card/CardView";
import type { Variant } from "@/components/card/CardFaces";
import { deleteCard, duplicateCard, saveCard } from "@/lib/actions/cards";
import {
  emptyNpcData,
  emptyPlayerData,
  type ActionHalf,
  type CardKind,
  type NpcCardData,
  type PlayerCardData,
} from "@/lib/cards";
import { downloadFace, fileSlug } from "@/lib/export";
import { KeywordPalette } from "./KeywordPalette";
import { KeywordTextarea, type ActiveField } from "./KeywordTextarea";

export type ClassOption = {
  id: string;
  name: string;
  color: string;
  kind: "hero" | "npc";
  subgroups: string[];
};

type Initial = {
  id?: string;
  kind: CardKind;
  name: string;
  classId: string | null;
  data: PlayerCardData | NpcCardData;
};

type Props = {
  initial: Initial;
  classes: ClassOption[];
  meta?: { updatedAt: string; updatedBy: string | null };
};

type State = { kind: CardKind; name: string; classId: string | null; player: PlayerCardData; npc: NpcCardData };

function toState(i: Initial): State {
  return {
    kind: i.kind,
    name: i.name,
    classId: i.classId,
    player: i.kind === "player" ? (i.data as PlayerCardData) : emptyPlayerData(),
    npc: i.kind === "npc" ? (i.data as NpcCardData) : emptyNpcData(),
  };
}

const snapshot = (s: State) =>
  JSON.stringify({ kind: s.kind, name: s.name, classId: s.classId, data: s.kind === "player" ? s.player : s.npc });

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(380);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function CardEditor({ initial, classes, meta }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>(() => toState(initial));
  const [saved, setSaved] = useState(() => snapshot(toState(initial)));
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [variant, setVariant] = useState<Variant>("base");
  const [side, setSide] = useState<FaceSide>("front");
  const [showAllText, setShowAllText] = useState(false);
  const [exporting, setExporting] = useState(false);
  const active = useRef<ActiveField | null>(null);
  const [hasActive, setHasActive] = useState(false);
  const faceRef = useRef<HTMLDivElement>(null);
  const [previewRef, previewWidth] = useWidth<HTMLDivElement>();

  const id = initial.id;
  const dirty = snapshot(state) !== saved;

  // Server data changed (after a save, or someone else edited the card): adopt it
  // unless the user has unsaved edits of their own.
  const initialSnap = snapshot(toState(initial));
  const [lastInitial, setLastInitial] = useState(initialSnap);
  if (initialSnap !== lastInitial) {
    setLastInitial(initialSnap);
    if (!dirty) {
      setState(toState(initial));
      setSaved(initialSnap);
    }
  }

  // Next.js keeps visited routes alive in a hidden <Activity>. Once a new card has been
  // created, clear this form when it gets hidden, so "+ Nová karta" starts empty again.
  const created = useRef(false);
  const initialRef = useRef(initial);
  useEffect(() => {
    initialRef.current = initial;
  });
  useEffect(
    () => () => {
      if (!created.current) return;
      created.current = false;
      const fresh = toState(initialRef.current);
      setState(fresh);
      setSaved(snapshot(fresh));
      setSavedAt(null);
    },
    [],
  );
  const cls = classes.find((c) => c.id === state.classId) ?? null;
  const classInfo = cls ? { name: cls.name, color: cls.color } : null;
  const data = state.kind === "player" ? state.player : state.npc;

  // --- state helpers -----------------------------------------------------------
  const setPlayer = (fn: (p: PlayerCardData) => PlayerCardData) => setState((s) => ({ ...s, player: fn(s.player) }));
  const setNpc = (fn: (n: NpcCardData) => NpcCardData) => setState((s) => ({ ...s, npc: fn(s.npc) }));
  const setHalf = (which: "top" | "bottom", patch: Partial<ActionHalf>) =>
    setPlayer((p) => ({ ...p, [which]: { ...p[which], ...patch } }));
  const setBack = (patch: Partial<NpcCardData["back"]>) => setNpc((n) => ({ ...n, back: { ...n.back, ...patch } }));

  const activate = useCallback((f: ActiveField) => {
    active.current = f;
    setHasActive(true);
  }, []);

  const insertKeyword = (keyword: string) => {
    const f = active.current;
    if (!f || !f.el.isConnected) return;
    const el = f.el;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const needsSpace = before.length > 0 && !/[\s(]$/.test(before);
    const insert = `${needsSpace ? " " : ""}${keyword} `;
    pendingCaret.current = { el, pos: start + insert.length };
    f.set(before + insert + el.value.slice(end));
  };

  // Put the caret after the inserted keyword right after React re-renders the field.
  const pendingCaret = useRef<{ el: HTMLTextAreaElement | HTMLInputElement; pos: number } | null>(null);
  useLayoutEffect(() => {
    const p = pendingCaret.current;
    if (!p) return;
    pendingCaret.current = null;
    p.el.focus();
    p.el.setSelectionRange(p.pos, p.pos);
  });

  // --- save ----------------------------------------------------------------------
  const save = useCallback(() => {
    setError(null);
    const s = state;
    startTransition(async () => {
      const res = await saveCard(
        s.kind === "player"
          ? { id, kind: "player", name: s.name, classId: s.classId, data: s.player }
          : { id, kind: "npc", name: s.name, classId: s.classId, data: s.npc },
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(snapshot(s));
      setSavedAt(new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }));
      if (!id) {
        created.current = true;
        router.replace(`/generator/karty/${res.id}`);
      }
    });
  }, [state, id, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!pending) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, pending]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  // --- export ----------------------------------------------------------------------
  const exportPng = async () => {
    if (!faceRef.current) return;
    setExporting(true);
    try {
      const code = state.kind === "player" ? state.player.top.code : state.npc.code;
      const suffix = state.kind === "npc" ? (side === "back" ? "rub" : "lic") : variant === "upgraded" ? "vylepsena" : "";
      await downloadFace(faceRef.current, fileSlug(code, state.name, suffix));
    } catch (e) {
      console.error(e);
      setError("Export se nepovedl. Zkus to prosím znovu.");
    } finally {
      setExporting(false);
    }
  };

  const classGroups = useMemo(() => {
    const preferred = state.kind === "player" ? "hero" : "npc";
    return [
      { label: state.kind === "player" ? "Classy hrdinů" : "NPC skupiny", items: classes.filter((c) => c.kind === preferred) },
      { label: state.kind === "player" ? "NPC skupiny" : "Classy hrdinů", items: classes.filter((c) => c.kind !== preferred) },
    ].filter((g) => g.items.length > 0);
  }, [classes, state.kind]);

  const hasUpgraded = state.player.top.textUpgraded.trim() !== "" || state.player.bottom.textUpgraded.trim() !== "";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={cls ? `/generator?classa=${cls.id}` : "/generator"} className="btn btn-ghost -ml-2 px-2 text-muted">
          ← Knihovna
        </Link>
        <h1 className="font-display text-2xl font-bold">{id ? "Úprava karty" : "Nová karta"}</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted" aria-live="polite">
            {pending ? "Ukládám…" : dirty ? "Neuložené změny" : savedAt ? `Uloženo ${savedAt}` : id ? "Uloženo" : ""}
          </span>
          <button type="button" className="btn btn-primary" onClick={save} disabled={pending || (!dirty && !!id)}>
            Uložit <kbd className="hidden text-[10px] font-normal opacity-70 sm:inline">Ctrl+S</kbd>
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Form */}
        <div className="min-w-0 space-y-5">
          <section className="panel space-y-4 p-4">
            {!id && (
              <div>
                <span className="label">Typ karty</span>
                <div className="inline-flex rounded-md border border-line p-0.5">
                  {(["player", "npc"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setState((s) => ({ ...s, kind: k }));
                        setSide("front");
                      }}
                      className={`rounded px-3 py-1.5 text-sm font-semibold ${state.kind === k ? "bg-gold text-ink" : "text-muted hover:text-bone"}`}
                    >
                      {k === "player" ? "Hráčská karta" : "NPC karta"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
              <div>
                <label htmlFor="card-name" className="label">
                  Název karty
                </label>
                <input
                  id="card-name"
                  className="field text-base"
                  value={state.name}
                  onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="např. Nezastavitelnost"
                  autoFocus={!id}
                />
              </div>
              <div>
                <label htmlFor="card-class" className="label">
                  {state.kind === "player" ? "Classa" : "NPC skupina"}
                </label>
                <select
                  id="card-class"
                  className="field"
                  value={state.classId ?? ""}
                  onChange={(e) => setState((s) => ({ ...s, classId: e.target.value || null }))}
                >
                  <option value="">Obecná (pro všechny)</option>
                  {classGroups.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.items.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="panel sticky top-2 z-10 p-3 shadow-lg shadow-black/30">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Vložit ikonu</h2>
              <span className="text-xs text-faint">
                {hasActive ? "Klikni na ikonu – vloží se na místo kurzoru." : "Nejdřív klikni do textového pole."}
              </span>
            </div>
            <KeywordPalette onInsert={insertKeyword} disabled={!hasActive} />
          </section>

          {state.kind === "player" ? (
            <>
              {(["top", "bottom"] as const).map((which) => {
                const half = state.player[which];
                return (
                  <section key={which} className="panel space-y-3 p-4">
                    <h2 className="font-display text-lg font-bold">{which === "top" ? "Horní akce" : "Spodní akce"}</h2>
                    <div className="grid grid-cols-[1fr_100px] gap-3 sm:grid-cols-[140px_100px_1fr]">
                      <div>
                        <label className="label" htmlFor={`${which}-code`}>Kód</label>
                        <input
                          id={`${which}-code`}
                          className="field"
                          value={half.code}
                          onChange={(e) => setHalf(which, { code: e.target.value })}
                          placeholder={which === "top" ? "B01" : "B02"}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`${which}-time`}>Čas</label>
                        <input
                          id={`${which}-time`}
                          className="field"
                          type="number"
                          min={0}
                          max={99}
                          value={half.time ?? ""}
                          onChange={(e) => setHalf(which, { time: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                      </div>
                      <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm sm:col-span-1">
                        <input
                          type="checkbox"
                          className="size-4 accent-gold"
                          checked={half.reaction}
                          onChange={(e) => setHalf(which, { reaction: e.target.checked })}
                        />
                        Reakční akce
                      </label>
                    </div>
                    <KeywordTextarea
                      label="Text"
                      value={half.text}
                      onChange={(v) => setHalf(which, { text: v })}
                      onActivate={activate}
                      placeholder="VEDLE: ÚTOK 3, KRVÁCENÍ; KROK 2"
                    />
                    <KeywordTextarea
                      label="Vylepšený text (nepovinné)"
                      value={half.textUpgraded}
                      onChange={(v) => setHalf(which, { textUpgraded: v })}
                      onActivate={activate}
                      rows={2}
                    />
                  </section>
                );
              })}
              <section className="panel grid gap-4 p-4 sm:grid-cols-[160px_1fr]">
                <div>
                  <label className="label" htmlFor="symbol">Symbol ve středu</label>
                  <input
                    id="symbol"
                    className="field text-center"
                    maxLength={4}
                    value={state.player.symbol}
                    onChange={(e) => setPlayer((p) => ({ ...p, symbol: e.target.value }))}
                    placeholder="#"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="note">Poznámka (na kartě se nezobrazí)</label>
                  <textarea
                    id="note"
                    className="field"
                    rows={2}
                    value={state.player.note}
                    onChange={(e) => setPlayer((p) => ({ ...p, note: e.target.value }))}
                  />
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="panel space-y-3 p-4">
                <h2 className="font-display text-lg font-bold">Líc</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[140px_100px_1fr]">
                  <div>
                    <label className="label" htmlFor="npc-code">Kód</label>
                    <input
                      id="npc-code"
                      className="field"
                      value={state.npc.code}
                      onChange={(e) => setNpc((n) => ({ ...n, code: e.target.value }))}
                      placeholder="XN1"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="npc-time">Čas</label>
                    <input
                      id="npc-time"
                      className="field"
                      type="number"
                      min={0}
                      max={99}
                      value={state.npc.time ?? ""}
                      onChange={(e) => setNpc((n) => ({ ...n, time: e.target.value === "" ? null : Number(e.target.value) }))}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="label" htmlFor="npc-priority">Priorita</label>
                    <input
                      id="npc-priority"
                      className="field"
                      value={state.npc.priority}
                      onChange={(e) => setNpc((n) => ({ ...n, priority: e.target.value }))}
                      placeholder="Nejblíže"
                    />
                  </div>
                </div>
                <KeywordTextarea
                  label="Hlavní chování (specialista)"
                  value={state.npc.main}
                  onChange={(v) => setNpc((n) => ({ ...n, main: v }))}
                  onActivate={activate}
                />
                <div>
                  <span className="label">Spodní pole</span>
                  <div className="mb-2 inline-flex rounded-md border border-line p-0.5">
                    {(["zbytek", "vyjimka"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setNpc((n) => ({ ...n, secondaryKind: k }))}
                        className={`rounded px-3 py-1 text-sm font-semibold ${state.npc.secondaryKind === k ? "bg-gold text-ink" : "text-muted hover:text-bone"}`}
                      >
                        {k === "zbytek" ? "Zbytek (2/3 základ)" : "Výjimka (pojistka)"}
                      </button>
                    ))}
                  </div>
                  <KeywordTextarea
                    label={state.npc.secondaryKind === "zbytek" ? "Zbytek" : "Výjimka"}
                    value={state.npc.secondary}
                    onChange={(v) => setNpc((n) => ({ ...n, secondary: v }))}
                    onActivate={activate}
                  />
                </div>
              </section>

              <section className="panel space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold">Rub – predikce</h2>
                  {cls && cls.subgroups.length >= 3 && (
                    <button
                      type="button"
                      className="btn px-2.5 py-1 text-xs"
                      onClick={() =>
                        setBack({
                          bonusGroup: cls.subgroups[0],
                          neutralGroup: cls.subgroups[1],
                          penaltyGroup: cls.subgroups[2],
                        })
                      }
                    >
                      Doplnit skupiny z „{cls.name}“
                    </button>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="back-title">Název predikce</label>
                  <input
                    id="back-title"
                    className="field"
                    value={state.npc.back.title}
                    onChange={(e) => setBack({ title: e.target.value })}
                    onFocus={(e) => activate({ el: e.currentTarget, set: (v) => setBack({ title: v }) })}
                    placeholder="HNIJÍCÍ TICHO"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="bonus-group">Bonus – skupina</label>
                    <input id="bonus-group" className="field" value={state.npc.back.bonusGroup} onChange={(e) => setBack({ bonusGroup: e.target.value })} />
                  </div>
                  <KeywordTextarea label="Bonus – chování" rows={1} value={state.npc.back.bonusEffect} onChange={(v) => setBack({ bonusEffect: v })} onActivate={activate} />
                  <div>
                    <label className="label" htmlFor="neutral-group">0 – skupina</label>
                    <input id="neutral-group" className="field" value={state.npc.back.neutralGroup} onChange={(e) => setBack({ neutralGroup: e.target.value })} />
                  </div>
                  <div className="hidden sm:block" />
                  <div>
                    <label className="label" htmlFor="penalty-group">Postih – skupina</label>
                    <input id="penalty-group" className="field" value={state.npc.back.penaltyGroup} onChange={(e) => setBack({ penaltyGroup: e.target.value })} />
                  </div>
                  <KeywordTextarea label="Postih – chování" rows={1} value={state.npc.back.penaltyEffect} onChange={(v) => setBack({ penaltyEffect: v })} onActivate={activate} />
                </div>
              </section>
            </>
          )}

          {id && (
            <section className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {meta && (
                <p className="mr-auto text-xs text-faint">
                  Naposledy upraveno {new Date(meta.updatedAt).toLocaleString("cs-CZ")}
                  {meta.updatedBy ? ` · ${meta.updatedBy}` : ""}
                </p>
              )}
              <form action={duplicateCard.bind(null, id)}>
                <button className="btn" disabled={dirty} title={dirty ? "Nejdřív ulož změny" : undefined}>
                  Duplikovat
                </button>
              </form>
              <form
                action={deleteCard.bind(null, id)}
                onSubmit={(e) => {
                  if (!confirm(`Opravdu smazat kartu „${state.name}“?`)) e.preventDefault();
                }}
              >
                <button className="btn btn-danger">Smazat</button>
              </form>
            </section>
          )}
        </div>

        {/* Preview */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="panel space-y-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {state.kind === "player" ? (
                <div className="inline-flex rounded-md border border-line p-0.5" role="group" aria-label="Varianta">
                  {(["base", "upgraded"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={v === "upgraded" && !hasUpgraded}
                      onClick={() => setVariant(v)}
                      className={`rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-40 ${variant === v ? "bg-gold text-ink" : "text-muted hover:text-bone"}`}
                    >
                      {v === "base" ? "Základní" : "Vylepšená"}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="inline-flex rounded-md border border-line p-0.5" role="group" aria-label="Strana">
                  {(["front", "back"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSide(v)}
                      className={`rounded px-2.5 py-1 text-xs font-semibold ${side === v ? "bg-gold text-ink" : "text-muted hover:text-bone"}`}
                    >
                      {v === "front" ? "Líc" : "Rub"}
                    </button>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" className="accent-gold" checked={showAllText} onChange={(e) => setShowAllText(e.target.checked)} />
                Text u všech ikon
              </label>
              <button type="button" className="btn ml-auto px-2.5 py-1 text-xs" onClick={exportPng} disabled={exporting}>
                {exporting ? "Exportuji…" : "Stáhnout PNG"}
              </button>
            </div>
            <div ref={previewRef} className="w-full">
              <CardView
                ref={faceRef}
                kind={state.kind}
                name={state.name || "Bez názvu"}
                data={data}
                classInfo={classInfo}
                width={previewWidth}
                side={side}
                variant={variant === "upgraded" && hasUpgraded ? "upgraded" : "base"}
                showAllText={showAllText}
                className="mx-auto drop-shadow-[0_10px_25px_rgba(0,0,0,0.55)]"
              />
            </div>
            <p className="text-xs leading-relaxed text-faint">
              Klíčová slova psaná VELKÝMI písmeny se vykreslí jako ikony. Středník nebo nový řádek = nový řádek na kartě.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
