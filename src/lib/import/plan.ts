/**
 * Decides what importing parsed Excel tables (lib/import/excel.ts) does to the database: which
 * cards and classes get created, which cards change and how. Pure; the server actions in
 * lib/actions/import.ts load the rows, call this and carry the plan out.
 *
 *  - The class is matched by name (ignoring case) within heroes or NPC groups; a missing one is
 *    created from the table's title, passive/HP row and subgroup rows.
 *  - A card is matched within its class by code (top code for heroes), then by name. Only the
 *    fields the table has columns for are overwritten; cards missing from the Excel stay as they are.
 *  - When two rows lead to the same card, the first one (in sheet order) wins. Rows creating cards
 *    are matched against each other the same way, as if the earlier ones were already saved.
 */
import { z } from "zod";
import {
  emptyNpcData,
  emptyPlayerData,
  legacyNpcPanel,
  npcCardDataSchema,
  playerCardDataSchema,
  SECONDARY_KIND,
  type CardKind,
  type NpcCardData,
  type PlayerCardData,
} from "@/lib/cards";
import { capitalize, type CardFields } from "@/lib/import/excel";

// --- Input (what the browser sends) ---------------------------------------------

// Only the shape is checked here. What a card or class can hold is checked per row by
// planImport, so one odd cell doesn't turn the whole workbook away. The size of the request is
// capped by the Server Action body limit.
const fieldValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const tableSchema = z.object({
  sheet: z.string(),
  row: z.number().int().min(1),
  kind: z.enum(["player", "npc"]),
  className: z.string(),
  classInfo: z.object({
    hp: z.number().int().nullable(),
    passive: z.string(),
    subgroups: z.array(z.string()),
    description: z.string(),
  }),
  cards: z.array(
    z.object({
      row: z.number().int().min(1),
      name: z.string(),
      fields: z.record(z.string().max(40), fieldValue),
    }),
  ),
});

export const importInputSchema = z.object({ tables: z.array(tableSchema) });
export type ImportInput = z.infer<typeof importInputSchema>;

// --- Fields ----------------------------------------------------------------------

/** Card fields an import may set, with the label the preview shows (same as in the editor). */
export const FIELD_LABELS: Record<CardKind, Record<string, string>> = {
  player: {
    "top.code": "Horní akce – kód",
    "top.time": "Horní akce – čas",
    "top.reaction": "Horní akce – reakce",
    "top.text": "Horní akce – text",
    "top.textUpgraded": "Horní akce – vylepšený text",
    "bottom.code": "Dolní akce – kód",
    "bottom.time": "Dolní akce – čas",
    "bottom.reaction": "Dolní akce – reakce",
    "bottom.text": "Dolní akce – text",
    "bottom.textUpgraded": "Dolní akce – vylepšený text",
    symbol: "Symbol ve středu",
  },
  npc: {
    code: "Kód",
    time: "Čas",
    priority: "Priorita",
    main: "Hlavní chování",
    secondaryKind: "Druhé pole",
    secondary: "Druhé pole – text",
    "back.title": "Název predikce",
    "back.bonusGroup": "Bonus – skupina",
    "back.bonusEffect": "Bonus – chování",
    "back.neutralGroup": "0 – skupina",
    "back.penaltyGroup": "Postih – skupina",
    "back.penaltyEffect": "Postih – chování",
  },
};

/** Fields no column maps to, named when their stored value is invalid. */
const OTHER_LABELS: Record<string, string> = { note: "Poznámka" };

const GROUP_FIELDS = new Set(["back.bonusGroup", "back.neutralGroup", "back.penaltyGroup"]);

const CODE_FIELD: Record<CardKind, string> = { player: "top.code", npc: "code" };

type CardData = PlayerCardData | NpcCardData;
type Draft = Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (isRecord(o) ? o[k] : undefined), obj);
}

function setPath(obj: Draft, path: string, value: unknown) {
  const keys = path.split(".");
  const last = keys.pop()!;
  const parent = keys.reduce((o, k) => o[k] as Draft, obj);
  parent[last] = value;
}

/**
 * The stored data laid over an empty card. Unlike parsePlayerData/parseNpcData it keeps every
 * stored value, even one the current schema rejects, so the import never quietly resets a card;
 * the merged result is validated afterwards.
 */
function withDefaults(defaults: Draft, stored: unknown): Draft {
  const src = isRecord(stored) ? stored : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([k, d]) => [k, isRecord(d) ? withDefaults(d, src[k]) : src[k] === undefined ? d : src[k]]),
  );
}

const emptyData = (kind: CardKind): Draft => (kind === "player" ? emptyPlayerData() : emptyNpcData());

/** Case- and spacing-insensitive key of a card or class name. */
export const nameKey = (s: string) => s.normalize("NFC").toLocaleLowerCase("cs").replace(/\s+/g, " ").trim();

/** "potkani" → "Potkani" when the class has that subgroup, so the back of the card matches the class. */
function canonicalGroup(value: string, subgroups: string[]) {
  return subgroups.find((g) => nameKey(g) === nameKey(value)) ?? value;
}

/**
 * The Výjimka and Zbytek columns share the card's one secondary field: a filled cell sets it and
 * its kind, an empty one clears it only when the card holds that column's kind.
 */
function secondaryFields(before: Draft, fields: CardFields): [string, unknown][] {
  const has = (key: string) => Object.hasOwn(fields, key);
  if (!has("exception") && !has("rest")) return [];
  const exception = String(fields.exception ?? "");
  const rest = String(fields.rest ?? "");
  if (exception) return [["secondaryKind", "vyjimka"], ["secondary", exception]];
  if (rest) return [["secondaryKind", "zbytek"], ["secondary", rest]];
  return has(before.secondaryKind === "vyjimka" ? "exception" : "rest") ? [["secondary", ""]] : [];
}

function show(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "ano" : "ne";
  if (key === "secondaryKind") return SECONDARY_KIND[value as NpcCardData["secondaryKind"]]?.label ?? String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function describeIssue(kind: CardKind, issue: z.ZodError["issues"][number]) {
  const path = issue.path.join(".");
  const label = FIELD_LABELS[kind][path] ?? OTHER_LABELS[path] ?? path;
  const reason =
    issue.code === "too_big"
      ? `nejvýš ${issue.maximum}${issue.origin === "string" ? " znaků" : ""}`
      : issue.code === "too_small"
        ? `nejméně ${issue.minimum}`
        : "neplatná hodnota";
  return `${label}: ${reason}`;
}

// --- Plan ------------------------------------------------------------------------

export type ExistingClass = { id: string; name: string; kind: "hero" | "npc"; subgroups: string[] };
export type ExistingCard = { id: string; kind: CardKind; classId: string | null; name: string; data: unknown };

export type NewClass = {
  key: string;
  name: string;
  kind: "hero" | "npc";
  hp: number | null;
  passive: string;
  subgroups: string[];
  description: string;
};

export type CardChange = { field: string; from: string; to: string };

export type PlannedCard = {
  sheet: string;
  row: number;
  kind: CardKind;
  name: string;
  className: string;
  /** duplicate: an earlier row in the import already covers the same card and is used instead. */
  status: "create" | "update" | "same" | "duplicate" | "skip";
  /** Existing card (update/same). */
  cardId: string | null;
  /** Class of a created card: an existing one, or a NewClass by key. */
  classId: string | null;
  newClassKey: string | null;
  changes: CardChange[];
  /** Why the row is skipped, or a note on the change. */
  message: string | null;
  /** What gets written (create/update). */
  data: CardData | null;
};

export type ImportPlan = { newClasses: NewClass[]; cards: PlannedCard[] };

/** A card a row may update: an existing one (with its stored data), or one created by an earlier row. */
type Candidate = { id: string; name: string; code: string; data?: unknown };

/** The card a row updates: by code, then by name. Several candidates are an error, none means a new card. */
function findCard(candidates: Candidate[], code: string, name: string): { card: Candidate | null } | { error: string } {
  if (code) {
    const byCode = candidates.filter((c) => nameKey(c.code) === nameKey(code));
    if (byCode.length === 1) return { card: byCode[0] };
    if (byCode.length > 1) {
      const both = byCode.filter((c) => nameKey(c.name) === nameKey(name));
      if (both.length === 1) return { card: both[0] };
      return { error: `kód ${code} má víc karet (${byCode.map((c) => c.name).join(", ")}) – nevím, kterou upravit` };
    }
  }
  const byName = candidates.filter((c) => nameKey(c.name) === nameKey(name));
  if (byName.length > 1) return { error: `víc karet se jmenuje „${name}“ – nevím, kterou upravit` };
  return { card: byName[0] ?? null };
}

/** "havěť" → "Havěť", "PALADIN" → "Paladin". */
function displayClassName(raw: string) {
  const name = raw.trim();
  return capitalize(name === name.toLocaleUpperCase("cs") ? name.toLocaleLowerCase("cs") : name);
}

/** Why a class can't be created from the table, if it can't (limits as in the class form). */
function newClassError(c: NewClass) {
  if (!c.name) return "tabulka nemá název classy";
  if (c.name.length > 60) return "název classy nad tabulkou je delší než 60 znaků";
  if (c.hp !== null && (c.hp < 0 || c.hp > 999)) return `životy classy (${c.hp}) musí být mezi 0 a 999`;
  if (c.passive.length > 4000) return "pasivka classy (řádek s PAS) je delší než 4000 znaků";
  if (c.description.length > 4000) return "popis skupiny z řádků s podskupinami je delší než 4000 znaků";
  return null;
}

export function planImport(input: ImportInput, classes: ExistingClass[], cards: ExistingCard[]): ImportPlan {
  const newClasses: NewClass[] = [];
  const planned: PlannedCard[] = [];

  /** Existing cards per kind and class, with their code read once. */
  const existing = new Map<string, Candidate[]>();
  for (const c of cards) {
    const key = `${c.kind}|${c.classId}`;
    const code = getPath(c.data, CODE_FIELD[c.kind]);
    if (!existing.has(key)) existing.set(key, []);
    existing.get(key)!.push({ id: c.id, name: c.name, code: typeof code === "string" ? code : "", data: c.data });
  }
  /** Cards created by earlier rows, per kind and class key. */
  const created = new Map<string, Candidate[]>();
  /** Card identities taken by an earlier row → where, and whether that row imports. */
  const claimed = new Map<string, { where: string; ok: boolean }>();

  for (const table of input.tables) {
    const classKind = table.kind === "player" ? "hero" : "npc";
    const sameName = classes.filter((c) => c.kind === classKind && nameKey(c.name) === nameKey(table.className));
    let target: { id: string | null; newKey: string | null; name: string; subgroups: string[] };
    let classError: string | null = null;
    if (sameName.length > 0) {
      const [c] = sameName;
      target = { id: c.id, newKey: null, name: c.name, subgroups: c.subgroups };
      if (sameName.length > 1) {
        classError = `v generátoru je víc ${classKind === "hero" ? "class" : "NPC skupin"} „${c.name}“ – přejmenuj je, ať je jasné, do které karta patří`;
      }
    } else {
      let newClass = newClasses.find((c) => c.kind === classKind && nameKey(c.name) === nameKey(table.className));
      if (!newClass) {
        const { hp, passive, subgroups, description } = table.classInfo;
        newClass = {
          key: `new-${newClasses.length}`,
          name: displayClassName(table.className),
          kind: classKind,
          hp: classKind === "hero" ? hp : null,
          passive,
          // The class form keeps at most 6 too.
          subgroups: classKind === "npc" ? subgroups.map((g) => g.trim()).filter(Boolean).slice(0, 6) : [],
          description,
        };
        newClasses.push(newClass);
      }
      target = { id: null, newKey: newClass.key, name: newClass.name, subgroups: newClass.subgroups };
      classError = newClassError(newClass);
    }
    const classKey = `${table.kind}|${target.id ?? target.newKey}`;
    const candidates = target.id ? (existing.get(classKey) ?? []) : [];
    const labels = FIELD_LABELS[table.kind];

    for (const row of table.cards) {
      const name = row.name.trim();
      const card: PlannedCard = {
        sheet: table.sheet,
        row: row.row,
        kind: table.kind,
        name,
        className: target.name,
        status: "skip",
        cardId: null,
        classId: target.id,
        newClassKey: target.newKey,
        changes: [],
        message: classError,
        data: null,
      };
      planned.push(card);
      if (classError) continue;
      if (!name || name.length > 120) {
        card.message = name ? "Název: nejvýš 120 znaků" : "karta nemá název";
        continue;
      }

      const fields = Object.entries(row.fields)
        .filter(([key]) => Object.hasOwn(labels, key))
        .map(([key, value]): [string, unknown] => [
          key,
          GROUP_FIELDS.has(key) && typeof value === "string" ? canonicalGroup(value, target.subgroups) : value,
        ]);
      const code = String(fields.find(([key]) => key === CODE_FIELD[table.kind])?.[1] ?? "").trim();

      const match = findCard(candidates, code, name);
      if ("error" in match) {
        card.message = match.error;
        continue;
      }
      let identity: string;
      if (match.card) {
        identity = match.card.id;
      } else {
        if (!created.has(classKey)) created.set(classKey, []);
        const earlierNew = created.get(classKey)!;
        const same = findCard(earlierNew, code, name);
        if ("error" in same) {
          card.message = same.error;
          continue;
        }
        identity = same.card?.id ?? `new:${planned.length}`;
        if (!same.card) earlierNew.push({ id: identity, name, code });
      }
      const earlier = claimed.get(identity);
      if (earlier) {
        if (earlier.ok) {
          card.status = "duplicate";
          card.message = `stejná karta je už výš: ${earlier.where}`;
        } else {
          card.message = `stejná karta je už výš (${earlier.where}) a ta nejde importovat – oprav ji tam`;
        }
        continue;
      }
      const claim = { where: `list „${table.sheet}“, řádek ${row.row}`, ok: false };
      claimed.set(identity, claim);

      const stored = match.card?.data;
      const before = withDefaults(emptyData(table.kind), stored);
      if (table.kind === "npc") fields.push(...secondaryFields(before, row.fields));
      const draft = structuredClone(before);
      for (const [key, value] of fields) setPath(draft, key, value);
      const parsed = (table.kind === "player" ? playerCardDataSchema : npcCardDataSchema).safeParse(draft);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const written = fields.some(([key]) => key === issue.path.join("."));
        card.message = written
          ? describeIssue(table.kind, issue)
          : `${describeIssue(table.kind, issue)} – takhle je to uložené v generátoru a tabulka to pole nepřepisuje, oprav ho tam`;
        continue;
      }
      claim.ok = true;
      card.data = parsed.data;

      if (!match.card) {
        card.status = "create";
        continue;
      }
      card.cardId = match.card.id;
      if (match.card.name !== name) card.changes.push({ field: "Název", from: match.card.name, to: name });
      for (const [key] of fields) {
        const from = show(key, getPath(before, key));
        const to = show(key, getPath(parsed.data, key));
        if (from !== to) card.changes.push({ field: labels[key], from, to });
      }
      card.status = card.changes.length ? "update" : "same";
      const panel = card.status === "update" && legacyNpcPanel(stored);
      if (panel) card.changes.push({ field: "Levý panel (zrušený, už se netiskne)", from: panel, to: "" });
    }
  }

  // A class is only created along with a card in it.
  const used = new Set(planned.filter((c) => c.status === "create").map((c) => c.newClassKey));
  return { newClasses: newClasses.filter((c) => used.has(c.key)), cards: planned };
}
