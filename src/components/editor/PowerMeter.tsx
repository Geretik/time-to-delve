"use client";

import { useMemo } from "react";
import {
  REACTION_BONUS,
  estimatePower,
  formatDeviation,
  formatPower,
  judgePower,
  timesLabel,
  verdictLabel,
  type PowerEstimate,
  type PowerLevel,
  type PowerVerdict,
} from "@/lib/power";

const LEVEL_STYLE: Record<PowerLevel, { badge: string; bar: string }> = {
  ok: { badge: "border-ok/50 bg-ok/10 text-ok", bar: "bg-ok" },
  warn: { badge: "border-gold/50 bg-gold/10 text-gold", bar: "bg-gold" },
  bad: { badge: "border-danger/50 bg-danger/10 text-danger", bar: "bg-danger" },
};

/** Estimate of a text, recomputed only when the text changes – the editor re-renders on every keystroke. */
function useEstimate(text: string, reaction = false): PowerEstimate | null {
  return useMemo(() => (text.trim() ? estimatePower(text, { reaction }) : null), [text, reaction]);
}

/** Power estimate of one action of a hero card, compared with the budget for its time. */
export function ActionPower({
  text,
  upgraded,
  time,
  reaction,
}: {
  text: string;
  upgraded: string;
  time: number | null;
  reaction: boolean;
}) {
  const base = useEstimate(text, reaction);
  const up = useEstimate(upgraded, reaction);
  if (!base && !up) return null;
  const counted = !!base && base.items.length > 0;
  const upCounted = !!up && up.items.length > 0;
  const verdict = counted ? judgePower(base.base, time, reaction) : null;
  const upVerdict = upCounted ? judgePower(up.base, time, reaction) : null;

  return (
    <div className="rounded-md border border-line bg-ink/40 p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">Odhad síly</span>
        {counted ? (
          <>
            <Amount estimate={base} />
            <span className="text-xs text-faint">
              {verdict
                ? `rozpočet ${formatPower(verdict.budget)} za ${timesLabel(time ?? 0)}${reaction ? ` (reakce ×${formatPower(REACTION_BONUS)})` : ""}`
                : "doplň čas akce pro porovnání s rozpočtem"}
            </span>
            {verdict && <Badge verdict={verdict} />}
          </>
        ) : (
          <span className="text-xs text-faint">
            {base ? "v textu zatím není žádný efekt s cenou" : "základní text je prázdný"}
          </span>
        )}
      </div>

      {counted && verdict && <Bar estimate={base} verdict={verdict} />}

      {up && (
        <p className="mt-2 text-xs text-muted">
          Vylepšená: <Amount estimate={up} small />
          {upVerdict && <> · {formatDeviation(upVerdict.deviation)} proti rozpočtu</>}
        </p>
      )}

      <Notes estimates={[base, up].filter((e) => e !== null)} />

      {(counted || upCounted) && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-faint select-none hover:text-muted">Rozpis</summary>
          {counted && <Breakdown estimate={base} />}
          {upCounted && (
            <>
              <p className={`${counted ? "mt-2" : "mt-1"} mb-1 font-semibold text-muted`}>Vylepšená</p>
              <Breakdown estimate={up} />
            </>
          )}
        </details>
      )}
    </div>
  );
}

/**
 * NPC cards have no budget in the rules yet, so this only shows the power and the power per
 * time, to compare cards within a group.
 */
export function NpcPower({
  main,
  secondary,
  secondaryLabel,
  time,
}: {
  main: string;
  secondary: string;
  secondaryLabel: string;
  time: number | null;
}) {
  const mainEstimate = useEstimate(main);
  const secondaryEstimate = useEstimate(secondary);
  const rows = [
    { label: "Hlavní chování", estimate: mainEstimate },
    { label: secondaryLabel, estimate: secondaryEstimate },
  ].filter((r): r is { label: string; estimate: PowerEstimate } => r.estimate !== null);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-md border border-line bg-ink/40 p-3 text-sm">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">Odhad síly</span>
        <span className="text-xs text-faint">Pro NPC pravidla rozpočet nemají – porovnávej s kartami skupiny.</span>
      </div>
      <ul className="space-y-1">
        {rows.map(({ label, estimate }) => (
          <li key={label} className="flex flex-wrap items-baseline gap-x-3">
            <span className="w-28 shrink-0 text-xs text-muted">{label}</span>
            {estimate.items.length > 0 ? (
              <>
                <Amount estimate={estimate} />
                {time ? (
                  <span className="text-xs text-faint">{formatPower(estimate.base / time)} na 1 čas</span>
                ) : null}
              </>
            ) : (
              <span className="text-xs text-faint">žádný efekt s cenou</span>
            )}
          </li>
        ))}
      </ul>
      <Notes estimates={rows.map((r) => r.estimate)} />
      {rows.some((r) => r.estimate.items.length > 0) && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-faint select-none hover:text-muted">Rozpis</summary>
          {rows.map(({ label, estimate }) =>
            estimate.items.length > 0 ? (
              <div key={label}>
                <p className="mt-2 mb-1 font-semibold text-muted">{label}</p>
                <Breakdown estimate={estimate} />
              </div>
            ) : null,
          )}
        </details>
      )}
    </div>
  );
}

function Amount({ estimate, small }: { estimate: PowerEstimate; small?: boolean }) {
  return (
    <span>
      <span className={`font-semibold tabular-nums text-bone ${small ? "" : "text-base"}`}>{formatPower(estimate.base)}</span>
      {estimate.conditional !== 0 && (
        <span className="text-xs text-muted">
          {" "}
          {estimate.conditional > 0 ? "+" : ""}
          {formatPower(estimate.conditional)} podmíněně
        </span>
      )}
    </span>
  );
}

function Badge({ verdict }: { verdict: PowerVerdict }) {
  return (
    <span className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-semibold ${LEVEL_STYLE[verdict.level].badge}`}>
      {formatDeviation(verdict.deviation)} · {verdictLabel(verdict)}
    </span>
  );
}

/** Base power (solid), conditional power (faded) and a tick at the budget. */
function Bar({ estimate, verdict }: { estimate: PowerEstimate; verdict: PowerVerdict }) {
  const base = Math.max(0, estimate.base);
  const cond = Math.max(0, estimate.conditional);
  const scale = Math.max(verdict.budget * 1.6, base + cond);
  const pct = (n: number) => `${(n / scale) * 100}%`;
  return (
    <div className="relative mt-2 h-2 rounded-full bg-line" aria-hidden>
      <div className="absolute inset-y-0 left-0 flex overflow-hidden rounded-full" style={{ width: pct(base + cond) }}>
        <div className={LEVEL_STYLE[verdict.level].bar} style={{ width: `${base + cond ? (base / (base + cond)) * 100 : 0}%` }} />
        <div className={`${LEVEL_STYLE[verdict.level].bar} flex-1 opacity-35`} />
      </div>
      <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded bg-bone" style={{ left: pct(verdict.budget) }} />
    </div>
  );
}

function Breakdown({ estimate }: { estimate: PowerEstimate }) {
  return (
    <ul className="space-y-0.5">
      {estimate.items.map((it, i) => (
        <li key={i} className="flex items-baseline gap-2">
          <span className="font-mono text-bone/90">{it.label}</span>
          {it.note && <span className="text-faint">{it.note}</span>}
          {it.conditional && <span className="text-faint italic">podmíněně</span>}
          <span className="ml-auto tabular-nums text-muted">{formatPower(it.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function Notes({ estimates }: { estimates: PowerEstimate[] }) {
  const merge = (pick: (e: PowerEstimate) => string[]) => [...new Set(estimates.flatMap(pick))];
  const lowercase = merge((e) => e.lowercase);
  const unpriced = merge((e) => e.unpriced);
  const noValue = merge((e) => e.noValue);
  if (!lowercase.length && !unpriced.length && !noValue.length) return null;
  return (
    <div className="mt-2 space-y-0.5 text-xs">
      {lowercase.length > 0 && (
        <p className="text-gold">
          Nepočítá se, není VELKÝMI písmeny: {lowercase.join(", ")}
        </p>
      )}
      {unpriced.length > 0 && <p className="text-faint">Bez ceny v pravidlech: {unpriced.join(", ")}</p>}
      {noValue.length > 0 && <p className="text-faint">Bez čísla, nepočítá se: {noValue.join(", ")}</p>}
    </div>
  );
}
