"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { applyImport, previewImport, type ApplyResult, type ImportPreview } from "@/lib/actions/import";
import { parseWorkbook, type ParsedWorkbook } from "@/lib/import/excel";

type PlannedCard = ImportPreview["cards"][number];
type Done = Extract<ApplyResult, { ok: true }>;

const XLSX = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const COMPARING = "Porovnávám s kartami v generátoru…";

const where = (c: { sheet: string; row: number }) => `${c.sheet}, ř. ${c.row}`;

function plural(n: number, one: string, few: string, many: string) {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

export function ExcelImport() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  /** Indexes of tables the user unticked. */
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState("");
  const [pending, startTransition] = useTransition();

  const input = (wb: ParsedWorkbook, skip: Set<number>) => ({ tables: wb.tables.filter((_, i) => !skip.has(i)) });

  /**
   * Runs `action` as a transition showing `message`. The message is set outside the transition:
   * inside, React would hold it back until the action finishes. Later steps set theirs after an
   * await, which React doesn't treat as part of the transition either.
   */
  function run(message: string, action: () => Promise<void>) {
    setBusy(message);
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        // A redirect (e.g. to sign in again) has to reach Next.js.
        unstable_rethrow(e);
        console.error(e);
        setError("Nepodařilo se spojit se serverem. Zkus to znovu.");
      }
    });
  }

  async function loadPreview(wb: ParsedWorkbook, skip: Set<number>) {
    const res = await previewImport(input(wb, skip));
    setPreview(res.ok ? res.preview : null);
    setError(res.ok ? null : res.error);
  }

  function onFile(file: File | undefined) {
    setDone(null);
    setPreview(null);
    setWorkbook(null);
    setFileName(file?.name ?? null);
    if (!file) {
      setError(null);
      return;
    }
    run("Čtu sešit…", async () => {
      let wb: ParsedWorkbook;
      try {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        wb = parseWorkbook(await readXlsxFile(file));
      } catch (e) {
        console.error(e);
        setError("Soubor se nepodařilo přečíst. Je to sešit .xlsx (ne starší .xls)?");
        return;
      }
      setWorkbook(wb);
      setExcluded(new Set());
      setBusy(COMPARING);
      await loadPreview(wb, new Set());
    });
  }

  function toggleTable(i: number) {
    if (!workbook) return;
    const next = new Set(excluded);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setExcluded(next);
    setDone(null);
    run(COMPARING, () => loadPreview(workbook, next));
  }

  function retryPreview() {
    if (workbook) run(COMPARING, () => loadPreview(workbook, excluded));
  }

  function apply() {
    if (!workbook || !preview) return;
    const { token } = preview;
    run("Importuji…", async () => {
      const res = await applyImport(input(workbook, excluded), token);
      if (!res.ok) {
        // The cards changed since the preview: show what an import would do now.
        if (res.preview) setPreview(res.preview);
        setError(res.error);
        return;
      }
      setDone(res);
      setBusy(COMPARING);
      // Shows the same tables again, now (nearly) all unchanged.
      await loadPreview(workbook, excluded);
    });
  }

  const byStatus = (status: PlannedCard["status"]) => preview?.cards.filter((c) => c.status === status) ?? [];
  const created = byStatus("create");
  const updated = byStatus("update");
  const same = byStatus("same");
  const skipped = byStatus("skip");
  const duplicates = byStatus("duplicate");
  const emptySheets = workbook?.sheets.filter((s) => s.tables === 0).map((s) => s.name) ?? [];

  return (
    <div className="space-y-6">
      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`btn ${fileName ? "" : "btn-primary"} cursor-pointer has-disabled:cursor-not-allowed has-disabled:opacity-50 has-focus-visible:outline-2 has-focus-visible:outline-gold`}>
            {fileName ? "Vybrat jiný sešit…" : "Vybrat sešit .xlsx…"}
            <input
              id="xlsx"
              type="file"
              accept={XLSX}
              disabled={pending}
              className="sr-only"
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                // Picking the same (edited) file again must fire onChange too.
                e.target.value = "";
              }}
            />
          </label>
          {fileName && <span className="min-w-0 truncate text-sm text-muted">{fileName}</span>}
        </div>
        <p className="mt-2 text-xs text-faint">
          {fileName ? "Po úpravě v Excelu ho vyber znovu. " : "Sešit se přečte v prohlížeči. "}V generátoru se nic
          nezmění, dokud import nepotvrdíš.
        </p>
      </div>

      {pending && <p className="animate-pulse text-sm text-muted">{busy}</p>}
      {error && (
        <p role="alert" className="rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
          {workbook && !preview && !pending && (
            <>
              {" "}
              <button type="button" className="font-semibold underline hover:text-bone" onClick={retryPreview}>
                Zkusit znovu
              </button>
            </>
          )}
        </p>
      )}
      {done && (
        <div role="status" className="rounded-md border border-ok/50 bg-ok/10 px-3 py-2 text-sm">
          Hotovo: {plural(done.created, "nová karta", "nové karty", "nových karet")},{" "}
          {plural(done.updated, "upravená", "upravené", "upravených")}
          {done.classes > 0 && `, ${plural(done.classes, "nová classa", "nové classy", "nových class")}`}.{" "}
          <Link href="/generator" className="font-semibold text-gold hover:text-gold-strong">
            Zobrazit karty
          </Link>
        </div>
      )}

      {workbook && (
        <section className="panel p-4">
          <h2 className="mb-1 font-display text-lg font-bold">Tabulky v sešitu</h2>
          {workbook.tables.length === 0 ? (
            <p className="text-sm text-muted">Nenašel jsem žádnou tabulku karet. Jak má vypadat, popisuje nápověda dole.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-faint">Odškrtni tabulky, které importovat nechceš.</p>
              <ul className="space-y-1.5">
                {workbook.tables.map((t, i) => (
                  <li key={`${t.sheet}-${t.row}`}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 accent-gold"
                        checked={!excluded.has(i)}
                        disabled={pending}
                        onChange={() => toggleTable(i)}
                      />
                      <span className="min-w-0">
                        <span className="font-semibold">{t.className}</span>{" "}
                        <span className="text-muted">
                          {t.kind === "player" ? "hrdina" : "NPC"} · {plural(t.cards.length, "karta", "karty", "karet")}
                        </span>
                        <span className="block text-xs text-faint">
                          list {t.sheet}, od ř. {t.row}
                          {t.ignoredColumns.length > 0 && ` · nečte se: ${t.ignoredColumns.join(", ")}`}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {workbook.issues.length > 0 && (
            <div className="mt-4">
              <h3 className="label">Upozornění</h3>
              <ul className="space-y-1 text-sm text-muted">
                {workbook.issues.map((issue) => (
                  <li key={`${issue.sheet}-${issue.row}-${issue.message}`}>
                    <span className="text-faint">{where(issue)}:</span> {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {emptySheets.length > 0 && (
            <p className="mt-4 text-xs text-faint">
              Listy bez tabulky karet: {emptySheets.join(", ")}. Tabulka karet potřebuje řádek se záhlavím, ve kterém je
              aspoň Název karty (u NPC Název) a popis akcí (u NPC Hlavní chování).
            </p>
          )}
        </section>
      )}

      {preview && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Count n={created.length} label="nových" tone="text-ok" />
            <Count n={updated.length} label="změněných" tone="text-gold" />
            <Count n={same.length} label="beze změny" tone="text-muted" />
            {skipped.length > 0 && <Count n={skipped.length} label="s chybou" tone="text-danger" />}
            {duplicates.length > 0 && <Count n={duplicates.length} label="v sešitu podruhé" tone="text-muted" />}
          </div>

          {preview.newClasses.length > 0 && (
            <section className="panel p-4">
              <h2 className="mb-2 font-display text-lg font-bold">Nové classy</h2>
              <ul className="text-sm">
                {preview.newClasses.map((c) => (
                  <li key={`${c.kind}-${c.name}`}>
                    <span className="font-semibold">{c.name}</span>{" "}
                    <span className="text-muted">
                      ({c.kind === "hero" ? "classa hrdiny" : "NPC skupina"}, {plural(c.cards, "karta", "karty", "karet")})
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-faint">Vytvoří se v šedé barvě – barvu a pořadí jim pak nastav v Classách.</p>
            </section>
          )}

          {updated.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-xl font-bold">Změny</h2>
              <ul className="space-y-3">
                {updated.map((c) => (
                  <li key={`${c.sheet}-${c.row}`} className="panel p-4">
                    <CardTitle card={c} />
                    <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
                      {c.changes.map((ch) => (
                        <div key={ch.field} className="contents">
                          <dt className="text-xs font-semibold text-muted sm:pt-0.5">{ch.field}</dt>
                          <dd className="min-w-0 space-y-1">
                            <Value text={ch.from} className="text-faint line-through decoration-danger/60" />
                            <Value text={ch.to} className="text-bone" />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {created.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-xl font-bold">Nové karty</h2>
              <ul className="panel divide-y divide-line">
                {created.map((c) => (
                  <li key={`${c.sheet}-${c.row}`} className="px-4 py-2">
                    <CardTitle card={c} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {skipped.length > 0 && (
            <section>
              <h2 className="mb-1 font-display text-xl font-bold">Nejde importovat</h2>
              <p className="mb-3 text-xs text-faint">Tyhle řádky se přeskočí. Oprav je v Excelu a sešit načti znovu.</p>
              <ul className="panel divide-y divide-line">
                {skipped.map((c) => (
                  <li key={`${c.sheet}-${c.row}`} className="px-4 py-2">
                    <CardTitle card={c} />
                    <p className="text-sm text-danger">{c.message}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {duplicates.length > 0 && (
            <details className="panel p-4">
              <summary className="cursor-pointer text-sm font-semibold text-muted">
                V sešitu podruhé: {plural(duplicates.length, "karta", "karty", "karet")} – použije se první výskyt
              </summary>
              <ul className="mt-2 space-y-1 text-sm text-faint">
                {duplicates.map((c) => (
                  <li key={`${c.sheet}-${c.row}`}>
                    <span className="text-muted">{c.name}</span> ({where(c)}) – {c.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {same.length > 0 && (
            <details className="panel p-4">
              <summary className="cursor-pointer text-sm font-semibold text-muted">
                Beze změny: {plural(same.length, "karta", "karty", "karet")}
              </summary>
              <p className="mt-2 text-sm text-faint">{same.map((c) => c.name).join(", ")}</p>
            </details>
          )}

          {created.length + updated.length > 0 ? (
            <div className="sticky bottom-0 -mx-4 border-t border-line bg-ink/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-t-xl sm:border-x">
              <button type="button" className="btn btn-primary" disabled={pending} onClick={apply}>
                Importovat: {plural(created.length, "nová", "nové", "nových")}, {plural(updated.length, "změna", "změny", "změn")}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted">Není co importovat – karty v generátoru odpovídají sešitu.</p>
          )}
        </>
      )}
    </div>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <span className="rounded-full border border-line px-3 py-1">
      <span className={`font-semibold ${tone}`}>{n}</span> <span className="text-muted">{label}</span>
    </span>
  );
}

function CardTitle({ card }: { card: PlannedCard }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      {card.cardId ? (
        <Link href={`/generator/karty/${card.cardId}`} className="font-semibold hover:text-gold">
          {card.name}
        </Link>
      ) : (
        <span className="font-semibold">{card.name}</span>
      )}
      <span className="text-sm text-muted">{card.className}</span>
      <span className="text-xs text-faint">{where(card)}</span>
    </div>
  );
}

function Value({ text, className }: { text: string; className: string }) {
  if (!text) return <div className="text-xs text-faint italic">prázdné</div>;
  return <div className={`break-words whitespace-pre-wrap ${className}`}>{text}</div>;
}
