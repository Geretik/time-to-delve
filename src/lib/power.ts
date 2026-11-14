/**
 * Odhad síly akce podle listu „Pravidla a informace“: ceny efektů z KEYWORDS a křivka,
 * kolik síly má akce dostat za svůj čas. Je to vodítko pro balanc, ne pravidlo – vlastní
 * mechaniky (RAGE, KOŘIST…), tvary oblastí a PLOŠNĚ cenu nemají a nepočítají se.
 *
 * Jak se text čte (po řádcích – závorka, podmínka ani „2x“ do dalšího řádku nepřetékají):
 * - slova před dvojtečkou jsou buď míření (VEDLE:, DOSAH 3, CÍLE 2:, OBLOUK PLOŠNĚ:, LINIE (3 pole):),
 *   nebo podmínka (RAGE:, CÍL KRVÁCÍ:, KŘEČ nebo TLAK:, Cíl již Krvácel:). Slova podmínky se necenují
 *   a efekty za ní až do středníku nebo konce řádku jsou podmíněné. Podmínka na konci řádku platí
 *   pro další řádek. U reakce je podmínka na začátku textu spouštěč, ne podmínka.
 * - efekt v závorce nebo s hodnotou „+X“ / „−X“ je také podmíněný,
 * - škodlivý efekt na SEBE (ZRAŇ, TLAK…) sílu snižuje; SEBE platí do středníku nebo konce řádku,
 * - CÍL X násobí efekty na cíle ve své klauzuli: od VEDLE / DOSAH / SEBE… po další míření za efekty,
 *   i přes středník, ne přes nový řádek. DOHLED, PLOŠNĚ a NE SEBE míření jen upřesňují. Efekty na tebe
 *   (pohyb, PŘIPRAV, OBRANA, SKRYTÍ) nenásobí. CÍL bez čísla je jen podmínka, CÍL X v závorce nebo
 *   za podmínkou přidá cíle podmíněně.
 * - „2x VEDLE: …“ počítá efekty dvakrát, do středníku nebo konce řádku.
 */
import { KEYWORDS, lowercaseKeywords, tokenizeLine, type Keyword, type Price } from "./keywords";

/** Tvary oblastí z pravidel – míří jako DOSAH, takže „LINIE (2–4 pole):“ není podmínka. */
const AREA_SHAPES = ["OBLOUK", "LINIE", "KUŽEL", "CONE", "TROJÚHELNÍK", "OKOLO"];
/** Spojky psané velkými písmeny („KŘEČ NEBO TLAK:“) nejsou vlastní mechaniky. */
const CONJUNCTIONS = new Set(["NEBO", "ANEBO", "ANI", "ALE"]);

// Czech endings of keywords used as ordinary words ("v DOSAHU", "CÍL již KRVÁCEL", "SEBOU"). A fixed
// list rather than any suffix, so custom mechanics like TLAKOVÁ VLNA or SEBEVĚDOMÍ are still reported.
const ENDINGS = new Set(
  ("|A|Á|E|É|Ě|I|Í|O|U|Ů|Y|Ý|OU|EM|ÍM|ŮM|ÁM|MI|AMI|EMI|ÍMI|ECH|ÍCH|ÁCH|EL|ELA|ELO|ELI|ELY|" +
    "IL|ILA|ILO|ILI|ÍŠ|ÍTE|EJÍ|EN|ENA|ENO|ENI|ENÝ|ENÁ|ENÉ|ENÍ|ENÍM").split("|"),
);
// KRVÁCENÍ, KRVÁCÍ → KRVÁC; OBRANA → OBRAN; DOSAH stays.
const stemOf = (word: string) => word.replace(/(?:ENÍ|[AEĚIÍOUYÝ])$/u, "");
const inflects = (word: string, stems: string[]) =>
  stems.some((s) => word.startsWith(s) && ENDINGS.has(word.slice(s.length)));
const KEYWORD_STEMS = KEYWORDS.flatMap((k) => [k.key, ...(k.aliases ?? [])]).map(stemOf);
const SHAPE_STEMS = AREA_SHAPES.map(stemOf);

/** Síla akce za 0–7 časů („1 čas = cca útok 1 … 7 čas = cca útok 12“). */
const TIME_BUDGET = [0, 1, 2, 3.5, 5, 7, 9, 12];
/** Reakce má mít zhruba o 50 % vyšší účinek než obyčejná karta. */
export const REACTION_BONUS = 1.5;
/** Odchylka od rozpočtu, která je ještě v normě, a hranice výrazné odchylky. */
export const TOLERANCE = 0.15;
const LIMIT = 0.35;

export function timeBudget(time: number, reaction: boolean): number {
  const last = TIME_BUDGET.length - 1;
  const step = TIME_BUDGET[last] - TIME_BUDGET[last - 1];
  // Past 7 times keep adding the last step (+3 per time); between whole times the curve is linear.
  const at = (t: number) => (t <= last ? TIME_BUDGET[t] : TIME_BUDGET[last] + (t - last) * step);
  const whole = Math.floor(time);
  const base = at(whole) + (time - whole) * (at(whole + 1) - at(whole));
  return base * (reaction ? REACTION_BONUS : 1);
}

export type PowerItem = {
  /** Jak je efekt napsaný na kartě, např. „ÚTOK 3“. */
  label: string;
  value: number;
  /** Za podmínkou, v závorce nebo s hodnotou ±X – platí jen někdy. */
  conditional: boolean;
  /** Proč se hodnota liší od ceny v pravidlech: „na sebe“, „×1,7“. */
  note?: string;
};

export type PowerEstimate = {
  base: number;
  conditional: number;
  items: PowerItem[];
  /** Slova bez ceny v pravidlech: DOHLED, PLOŠNĚ a vlastní mechaniky (RAGE, KOŘIST…). */
  unpriced: string[];
  /** Efekty počítané za bod bez čísla nebo s hodnotou X / ∞; nepočítají se. */
  noValue: string[];
  /** Klíčová slova psaná malými písmeny („Léčení“), která se nepočítají. */
  lowercase: string[];
};

type Clause = {
  /** Multiplier from CÍL X that always applies, and the largest one including conditional CÍL X. */
  targets: number;
  condTargets: number;
  /** The conditional CÍL X that set condTargets; it carries the extra power of those targets. */
  condSource?: Raw;
  /** Effects already written in the clause – the next targeting word then starts a new clause. */
  effects: number;
};
type Raw =
  | {
      kind: "effect";
      label: string;
      amount: number;
      conditional: boolean;
      selfHarm: boolean;
      multiply: boolean;
      repeat: number;
      clause: Clause;
    }
  | { kind: "targets"; label: string; clause: Clause };

type Mark = "(" | ")" | ";" | ":" | ",";
type Atom =
  | { kind: "keyword"; keyword: Keyword; written: string; value?: string }
  | { kind: "caps"; value: string }
  | { kind: "mark"; ch: Mark }
  | { kind: "text"; value: string };

const REPEAT_RE = /(?<![\p{L}\d])(\d+)\s*[x×]\s*$/iu;

function priceOf(price: Price, value: number): number {
  if ("flat" in price) return price.flat;
  if ("per" in price) return (value > 0 ? Math.max(0, value - (price.free ?? 0)) : value) * price.per;
  return 0;
}

/** One line of the text as keywords, capitalised words, punctuation that matters and the rest. */
function atomize(line: string): Atom[] {
  const atoms: Atom[] = [];
  for (const t of tokenizeLine(line)) {
    if (t.type === "keyword") atoms.push({ kind: "keyword", keyword: t.keyword, written: t.written, value: t.value });
    else if (t.type === "caps") atoms.push({ kind: "caps", value: t.value });
    else {
      for (const part of t.value.split(/([();:,])/)) {
        if (!part) continue;
        atoms.push(/^[();:,]$/.test(part) ? { kind: "mark", ch: part as Mark } : { kind: "text", value: part });
      }
    }
  }
  return atoms;
}

const isTargeting = (a: Atom) =>
  a.kind === "keyword" &&
  a.keyword.category === "mireni" &&
  // "CÍL KRVÁCÍ" names the target, it doesn't count them
  !(a.keyword.price && "targets" in a.keyword.price && a.value === undefined);

/** What the comma-separated part before a colon ends with: targeting, anything else, or only prose. */
function headOf(atoms: Atom[]): "target" | "other" | "prose" {
  let head: "target" | "other" | "prose" = "prose";
  for (const a of atoms) {
    if (a.kind === "keyword") head = isTargeting(a) ? "target" : "other";
    else if (a.kind === "caps" && !CONJUNCTIONS.has(a.value)) head = inflects(a.value, SHAPE_STEMS) ? "target" : "other";
  }
  return head;
}

/**
 * Finds the colons that close a condition rather than a targeting, and the atoms written in those
 * conditions. Only the last comma-separated part is the condition: in "ÚTOK 3, KŘEČ NEBO TLAK:"
 * ÚTOK 3 is still an effect. A part with only prose ("Ttrojúhelník (3 pole)") counts as targeting
 * when the rest of the segment is targeting ("DOSAH 2, …").
 */
function readColons(atoms: Atom[]): { conditions: Set<number>; inCondition: Set<number> } {
  const conditions = new Set<number>();
  const inCondition = new Set<number>();
  // Where the current segment of each bracket depth starts: after "(", ";" or ":".
  const starts = [0];
  let depth = 0;
  atoms.forEach((a, i) => {
    if (a.kind !== "mark") return;
    if (a.ch === "(") starts[++depth] = i + 1;
    else if (a.ch === ")") depth = Math.max(0, depth - 1);
    else if (a.ch === ";") starts[depth] = i + 1;
    else if (a.ch === ":") {
      const parts: { from: number; atoms: Atom[] }[] = [{ from: starts[depth], atoms: [] }];
      let nested = 0;
      for (let j = starts[depth]; j < i; j++) {
        const b = atoms[j];
        if (b.kind === "mark" && b.ch === "(") nested++;
        else if (b.kind === "mark" && b.ch === ")") nested = Math.max(0, nested - 1);
        else if (nested === 0 && b.kind === "mark" && b.ch === ",") parts.push({ from: j + 1, atoms: [] });
        else if (nested === 0) parts[parts.length - 1].atoms.push(b);
      }
      const heads = parts.map((p) => headOf(p.atoms));
      const last = heads[heads.length - 1];
      const targeting =
        last === "target" || (last === "prose" && heads.includes("target") && !heads.includes("other"));
      if (!targeting) {
        conditions.add(i);
        for (let j = parts[parts.length - 1].from; j < i; j++) inCondition.add(j);
      }
      starts[depth] = i + 1;
    }
  });
  return { conditions, inCondition };
}

export function estimatePower(text: string, { reaction = false }: { reaction?: boolean } = {}): PowerEstimate {
  const raw: Raw[] = [];
  const unpriced = new Set<string>();
  const noValue = new Set<string>();
  const newClause = (): Clause => ({ targets: 1, condTargets: 1, effects: 0 });
  let clause = newClause();
  // A reaction's opening condition ("Nepřítel ukončí kolo vedle tebe:") is its trigger.
  let triggerOpen = reaction;
  // A condition at the end of a line ("VEDLE KRVÁCÍ nebo CALM:") covers the next line.
  let carried = false;

  for (const line of text.split(/\r?\n/)) {
    const atoms = atomize(line);
    const { conditions, inCondition } = readColons(atoms);
    if (clause.effects > 0) clause = newClause();
    let depth = 0;
    // SEBE applies until ";", the end of the line, the next targeting word or the end of its bracket.
    let selfDepth: number | null = null;
    // Effects are conditional from a condition's colon until ";", the end of the line or its bracket.
    let condDepth: number | null = carried ? 0 : null;
    let condEmpty = false;
    let repeat = 1;

    atoms.forEach((a, i) => {
      if (a.kind === "text") {
        if (a.value.trim()) condEmpty = false;
        return;
      }
      if (a.kind === "mark") {
        if (a.ch === "(") {
          depth++;
          condEmpty = false;
        } else if (a.ch === ")") {
          depth = Math.max(0, depth - 1);
          if (selfDepth !== null && depth < selfDepth) selfDepth = null;
          if (condDepth !== null && depth < condDepth) condDepth = null;
        } else if (a.ch === ";") {
          if (selfDepth !== null && depth <= selfDepth) selfDepth = null;
          if (condDepth !== null && depth <= condDepth) condDepth = null;
          if (depth === 0) repeat = 1;
        } else if (a.ch === ":" && conditions.has(i)) {
          const trigger = triggerOpen && depth === 0 && raw.length === 0;
          if (!trigger) {
            condDepth = condDepth === null ? depth : Math.min(condDepth, depth);
            condEmpty = true;
          }
        }
        if (a.ch === ":" && depth === 0) triggerOpen = false;
        return;
      }
      condEmpty = false;
      if (a.kind === "caps") {
        if (!CONJUNCTIONS.has(a.value) && !inflects(a.value, KEYWORD_STEMS)) unpriced.add(a.value);
        return;
      }
      if (inCondition.has(i)) return; // "CÍL KRVÁCÍ:" – part of the condition, not an effect

      const kw = a.keyword;
      const label = a.value ? `${a.written} ${a.value}` : a.written;
      const signed = /^[+\-−]/.test(a.value ?? "");
      const value = a.value === undefined ? undefined : Number(a.value.replace("−", "-"));
      const price = kw.price;
      const conditional = depth > 0 || condDepth !== null || signed;

      if (price && "targets" in price) {
        if (value === undefined) return;
        if (!Number.isFinite(value)) {
          noValue.add(label);
          return;
        }
        // "CÍLE +1" adds targets to the ones the clause already has.
        const targets = signed ? clause.targets + price.targets * value : 1 + price.targets * (value - 1);
        if (!conditional) clause.targets = Math.max(clause.targets, targets);
        else if (targets > clause.condTargets) {
          const source: Raw = { kind: "targets", label, clause };
          clause.condTargets = targets;
          clause.condSource = source;
          raw.push(source);
        }
        return;
      }

      const targeting = kw.category === "mireni";
      if (targeting) {
        // DOHLED, PLOŠNĚ, NE SEBE… right after another targeting word only refine it.
        const fresh = clause.effects > 0;
        if (fresh) clause = newClause();
        const prev = atoms[i - 1];
        const times = prev?.kind === "text" ? REPEAT_RE.exec(prev.value) : null;
        if (times) repeat = Number(times[1]);
        else if (fresh) repeat = 1;
        selfDepth = kw.key === "SEBE" ? depth : null;
      } else {
        clause.effects++;
      }

      if (!price) {
        unpriced.add(kw.key);
        return;
      }
      if ("per" in price && (value === undefined || !Number.isFinite(value))) {
        noValue.add(label);
        return;
      }

      const onSelf = !targeting && selfDepth !== null;
      const selfHarm = onSelf && !!kw.harmful;
      const amount = priceOf(price, value ?? 0);
      raw.push({
        kind: "effect",
        label,
        amount: selfHarm ? -amount : amount,
        conditional,
        selfHarm,
        multiply: !targeting && !onSelf && !kw.self,
        repeat: targeting ? 1 : repeat,
        clause,
      });
    });

    carried = condDepth === 0 && condEmpty;
  }

  const items: PowerItem[] = [];
  for (const r of raw) {
    const clause = r.clause;
    if (r.kind === "targets") {
      // Extra targets reached only under a condition: the effects that always apply, on those targets.
      const extra = clause.condTargets - clause.targets;
      if (clause.condSource !== r || extra <= 0) continue;
      const hit = raw.reduce(
        (n, e) => (e.kind === "effect" && e.clause === clause && e.multiply && !e.conditional ? n + e.amount * e.repeat : n),
        0,
      );
      if (hit !== 0) items.push({ label: r.label, value: hit * extra, conditional: true, note: "další cíle" });
      continue;
    }
    const targets = !r.multiply ? 1 : r.conditional ? Math.max(clause.targets, clause.condTargets) : clause.targets;
    const factor = r.repeat * targets;
    const value = r.amount * factor;
    if (value === 0) continue;
    const notes = [r.selfHarm ? "na sebe" : null, factor !== 1 ? `×${formatPower(factor)}` : null].filter(Boolean);
    items.push({ label: r.label, value, conditional: r.conditional, note: notes.join(", ") || undefined });
  }

  const sum = (conditional: boolean) =>
    items.filter((it) => it.conditional === conditional).reduce((n, it) => n + it.value, 0);

  return {
    base: sum(false),
    conditional: sum(true),
    items,
    unpriced: [...unpriced],
    noValue: [...noValue],
    lowercase: lowercaseKeywords(text),
  };
}

export type PowerLevel = "ok" | "warn" | "bad";
export type PowerVerdict = { budget: number; deviation: number; level: PowerLevel };

/** Compares a power with the budget for the action's time; null while the action has no time. */
export function judgePower(power: number, time: number | null, reaction: boolean): PowerVerdict | null {
  if (time === null || !Number.isFinite(time) || time <= 0) return null;
  const budget = timeBudget(time, reaction);
  const deviation = power / budget - 1;
  const off = Math.abs(deviation);
  return { budget, deviation, level: off <= TOLERANCE ? "ok" : off <= LIMIT ? "warn" : "bad" };
}

export function verdictLabel({ level, deviation }: PowerVerdict): string {
  if (level === "ok") return "v normě";
  const side = deviation > 0 ? "silnější" : "slabší";
  return level === "warn" ? `o něco ${side}` : `výrazně ${side}`;
}

/** 5.25 → "5,3", −5.25 → "−5,3"; deterministic so server and client render the same text. */
export function formatPower(n: number): string {
  // Halves round away from zero on both sides; the epsilon absorbs float noise like 1.15 * 10 = 11.4999….
  const rounded = (Math.sign(n) * Math.round(Math.abs(n) * 10 + 1e-9)) / 10;
  return rounded.toFixed(1).replace(".", ",").replace("-", "−");
}

/** 0.084 → "+8 %" */
export function formatDeviation(deviation: number): string {
  const pct = Math.round(deviation * 100);
  return `${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)} %`;
}

/** Label for the icon legend, e.g. "1,0 za bod", "2 cíle = ×1,7". */
export function priceLabel(price: Price): string {
  if ("targets" in price) return `2 cíle = ×${formatPower(1 + price.targets)}`;
  if ("flat" in price) return price.flat === 0 ? "zdarma" : formatPower(price.flat);
  return price.free ? `${formatPower(price.per)} za bod nad ${price.free}` : `${formatPower(price.per)} za bod`;
}

/** "1 čas", "3 časy", "5 časů", "2,5 času" */
export function timesLabel(n: number): string {
  if (!Number.isInteger(n)) return `${String(n).replace(".", ",")} času`;
  return `${n} ${n === 1 ? "čas" : n >= 2 && n <= 4 ? "časy" : "časů"}`;
}
