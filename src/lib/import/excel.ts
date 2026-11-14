/**
 * Finds card tables in a workbook laid out like podklady/Time to Delve.xlsx and turns their rows
 * into card fields. Pure (no I/O): the browser reads the .xlsx with read-excel-file and passes the
 * sheets here, the server only ever sees the result (see lib/import/plan.ts).
 *
 * A table is recognised by its header row, matched by column names, so columns may be in any
 * order and missing ones leave the card's field untouched:
 *  - hero cards: "Název karty", "ID Vrch", "typ vrch", "čas vrch", "popis vrch (základní)",
 *    "popis vrch vylepšený", "Info Karty"/"Střed" (symbol) and the same for the bottom ("dole");
 *  - NPC cards: "ID", "Název", "čas", "Priorita", "Hlavní chování", "Výjimka", "Zbytek",
 *    "zadní Predikce", "Bonus", "Chování B", "0", "Postih", "Chování P".
 * The table ends at the first empty row. Its class is the title above the header (hero: the
 * merged title row; NPC: the group name left of the subgroup rows), or the sheet's name. A row
 * with a single filled cell is a note or the next table's title, never a card.
 */
import type { CardKind } from "@/lib/cards";

export type SheetInput = { sheet: string; data: readonly (readonly unknown[])[] };

/**
 * Card fields a table can fill, keyed by their path in the card's data. Except for NPC "exception"
 * and "rest" (the Výjimka and Zbytek columns): both go to the card's one secondary field, which
 * lib/import/plan.ts fills knowing what the card holds now.
 */
export type FieldValue = string | number | boolean | null;
export type CardFields = Record<string, FieldValue>;

export type ParsedCard = { row: number; name: string; fields: CardFields };

export type ParsedTable = {
  sheet: string;
  /** Header row, 1-based like in Excel. */
  row: number;
  kind: CardKind;
  /** As written in the sheet. */
  className: string;
  /** For creating the class when the database doesn't have it yet. */
  classInfo: { hp: number | null; passive: string; subgroups: string[]; description: string };
  cards: ParsedCard[];
  /** Header cells that don't map to a card field. */
  ignoredColumns: string[];
};

export type ParseIssue = { sheet: string; row: number; message: string };

export type ParsedWorkbook = {
  tables: ParsedTable[];
  issues: ParseIssue[];
  sheets: { name: string; tables: number }[];
};

// --- Columns -------------------------------------------------------------------

/** "Výjimka (pokud nelze hlavní)" → "vyjimka": no accents, case or parenthesised notes. */
export function normalizeHeader(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PLAYER_COLUMNS: Record<string, string[]> = {
  name: ["nazev karty", "nazev"],
  "top.code": ["id vrch", "id nahore", "kod vrch", "kod nahore"],
  "top.type": ["typ vrch", "typ nahore"],
  "top.time": ["cas vrch", "cas nahore"],
  "top.text": ["popis vrch", "popis vrch zakladni", "popis nahore", "popis nahore zakladni"],
  "top.textUpgraded": ["popis vrch vylepseny", "popis nahore vylepseny"],
  "bottom.code": ["id dole", "id spodni", "kod dole", "kod spodni"],
  "bottom.type": ["typ dole", "typ spodni"],
  "bottom.time": ["cas dole", "cas spodni"],
  "bottom.text": ["popis dole", "popis spodni", "popis dole zakladni", "popis spodni zakladni"],
  "bottom.textUpgraded": ["popis dole vylepseny", "popis spodni vylepseny"],
  symbol: ["stred", "symbol"],
  info: ["info karty"],
};

const NPC_COLUMNS: Record<string, string[]> = {
  code: ["id", "kod"],
  name: ["nazev", "nazev karty"],
  time: ["cas"],
  priority: ["priorita"],
  main: ["hlavni chovani"],
  exception: ["vyjimka"],
  rest: ["zbytek"],
  "back.title": ["zadni predikce", "predikce"],
  "back.bonusGroup": ["bonus", "skupina bonus"],
  "back.bonusEffect": ["chovani b", "chovani bonus"],
  "back.neutralGroup": ["0", "skupina 0"],
  "back.penaltyGroup": ["postih", "skupina postih"],
  "back.penaltyEffect": ["chovani p", "chovani postih"],
};

/** Columns a table must have, with the name shown when one is missing. */
const REQUIRED: Record<CardKind, Record<string, string>> = {
  player: { name: "Název karty", "top.text": "popis vrch", "bottom.text": "popis dole" },
  npc: { name: "Název", main: "Hlavní chování" },
};

type Header = { kind: CardKind; cols: Map<string, number>; start: number; end: number; ignored: string[] };

function mapColumns(cells: string[], spec: Record<string, string[]>) {
  const cols = new Map<string, number>();
  const ignored: string[] = [];
  cells.forEach((cell, i) => {
    if (!cell) return;
    const key = normalizeHeader(cell);
    const role = Object.keys(spec).find((r) => spec[r].includes(key));
    if (role && !cols.has(role)) cols.set(role, i);
    else ignored.push(cell);
  });
  return { cols, ignored };
}

/**
 * A recognised header, an error for a row that looks like a card header but isn't one, or null.
 * A lone "Název karty" doesn't count: the NPC sheet has a mock-up of a card next to its tables.
 */
function detectHeader(cells: string[]): Header | { error: string } | null {
  const start = cells.findIndex(Boolean);
  const end = cells.findLastIndex(Boolean) + 1;
  const player = mapColumns(cells, PLAYER_COLUMNS);
  const npc = mapColumns(cells, NPC_COLUMNS);

  for (const [kind, { cols, ignored }] of [["player", player], ["npc", npc]] as const) {
    if (Object.keys(REQUIRED[kind]).every((r) => cols.has(r))) return { kind, cols, start, end, ignored };
  }
  const best = player.cols.size >= npc.cols.size ? "player" : "npc";
  const { cols } = best === "player" ? player : npc;
  if (!cols.has("name") || cols.size < 3) return null;
  const missing = Object.entries(REQUIRED[best]).filter(([r]) => !cols.has(r)).map(([, label]) => `„${label}“`);
  return { error: `chybí ${missing.join(", ")}` };
}

// --- Cells ---------------------------------------------------------------------

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") {
    return v
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim();
  }
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v);
}

/** "3", 3 or "2R" (reaction) → time; "" → null; anything else → undefined. */
function parseTime(text: string): { time: number | null; reaction: boolean } | undefined {
  if (!text) return { time: null, reaction: false };
  const m = /^(\d{1,2})\s*(r)?$/i.exec(text);
  return m ? { time: Number(m[1]), reaction: Boolean(m[2]) } : undefined;
}

const sameName = (a: string, b: string) => normalizeHeader(a) === normalizeHeader(b) && normalizeHeader(a) !== "";

export const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase("cs") + s.slice(1);

// --- Rows ----------------------------------------------------------------------

type RowResult =
  | { card: ParsedCard; warning?: string }
  | { info: { hp: number | null; passive: string } }
  | { issue: string }
  | null;

function readPlayerRow(cells: string[], h: Header, row: number, title: string): RowResult {
  const get = (role: string) => (h.cols.has(role) ? cells[h.cols.get(role)!] : undefined);
  const name = get("name") ?? "";

  // The class's own row under its cards: "BARBAR | BPAS | <passive> | … | 22 životů". A card that
  // merely shares the class's name has neither the PAS code nor the hit points.
  const hp = cells.map((c) => /(\d+) zivot/.exec(normalizeHeader(c))).find(Boolean);
  if (/pas$/i.test(get("top.code") ?? "") || (sameName(name, title) && hp)) {
    const passive = [get("top.text"), get("top.textUpgraded")].filter(Boolean).join("\n\n");
    return { info: { hp: hp ? Number(hp[1]) : null, passive } };
  }

  const fields: CardFields = {};
  for (const half of ["top", "bottom"] as const) {
    const code = get(`${half}.code`);
    if (code !== undefined) fields[`${half}.code`] = code;
    const timeText = get(`${half}.time`);
    const type = get(`${half}.type`);
    const time = parseTime(timeText ?? "");
    if (!time) return { issue: `${name || "karta"}: čas ${half === "top" ? "vrch" : "dole"} „${timeText}“ není číslo (např. 3 nebo 2R) – karta přeskočena` };
    if (timeText !== undefined) fields[`${half}.time`] = time.time;
    if (timeText !== undefined || type !== undefined) fields[`${half}.reaction`] = time.reaction || /reakc/i.test(type ?? "");
    for (const key of ["text", "textUpgraded"] as const) {
      const v = get(`${half}.${key}`);
      if (v !== undefined) fields[`${half}.${key}`] = v;
    }
  }
  if (h.cols.has("symbol") || h.cols.has("info")) fields.symbol = get("symbol") || get("info") || "";
  return finishRow(name, fields, row);
}

function readNpcRow(cells: string[], h: Header, row: number): RowResult {
  const get = (role: string) => (h.cols.has(role) ? cells[h.cols.get(role)!] : undefined);
  const name = get("name") ?? "";
  const fields: CardFields = {};

  const code = get("code");
  if (code !== undefined) fields.code = code;
  const timeText = get("time");
  if (timeText !== undefined) {
    const time = parseTime(timeText);
    if (!time || time.reaction) return { issue: `${name || "karta"}: čas „${timeText}“ není číslo – karta přeskočena` };
    fields.time = time.time;
  }
  for (const key of NPC_TEXT_FIELDS) {
    const v = get(key);
    if (v !== undefined) fields[key] = v;
  }
  const exception = get("exception");
  const rest = get("rest");
  if (exception !== undefined) fields.exception = exception;
  if (rest !== undefined) fields.rest = rest;
  const result = finishRow(name, fields, row);
  if (result && "card" in result && exception && rest) {
    result.warning = `${name}: vyplněná Výjimka i Zbytek – karta má jen jedno pole, použije se Výjimka`;
  }
  return result;
}

const NPC_TEXT_FIELDS = [
  "priority",
  "main",
  "back.title",
  "back.bonusGroup",
  "back.bonusEffect",
  "back.neutralGroup",
  "back.penaltyGroup",
  "back.penaltyEffect",
];

function finishRow(name: string, fields: CardFields, row: number): RowResult {
  const hasContent = Object.values(fields).some((v) => v !== "" && v !== null && v !== false);
  if (!name) return hasContent ? { issue: "karta nemá název – přeskočena" } : null;
  if (name.length > 120) return { issue: `název „${short(name)}“ je delší než 120 znaků – karta přeskočena` };
  if (!hasContent) return { issue: `${name}: kromě názvu nemá nic vyplněného – přeskočena` };
  return { card: { row, name, fields } };
}

const short = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);

// --- Workbook ------------------------------------------------------------------

export function parseWorkbook(sheets: readonly SheetInput[]): ParsedWorkbook {
  const tables: ParsedTable[] = [];
  const issues: ParseIssue[] = [];
  const summary: ParsedWorkbook["sheets"] = [];

  for (const { sheet, data } of sheets) {
    const rows = data.map((r) => Array.from(r, cellText));
    const before = tables.length;
    const isEmpty = (r: number, start: number, end: number) => !rows[r]?.slice(start, end).some(Boolean);
    let lastEnd = 0;

    for (let r = 0; r < rows.length; r++) {
      const header = detectHeader(rows[r]);
      if (!header) continue;
      if ("error" in header) {
        const columns = rows[r].filter(Boolean);
        issues.push({
          sheet,
          row: r + 1,
          message: `tabulku se sloupci ${columns.slice(0, 4).join(", ")}${columns.length > 4 ? ", …" : ""} neumím načíst (${header.error}) – přeskočena`,
        });
        const [start, end] = [rows[r].findIndex(Boolean), rows[r].findLastIndex(Boolean) + 1];
        while (r + 1 < rows.length && !isEmpty(r + 1, start, end)) r++;
        lastEnd = r + 1;
        continue;
      }
      const { start, end } = header;

      // Title and NPC subgroups: the block right above the header (at most two empty rows
      // between), up to the previous table.
      const block: string[][] = [];
      let title = "";
      for (let p = r - 1, gap = 0; p >= lastEnd; p--) {
        if (isEmpty(p, start, end)) {
          if (block.length || ++gap > 2) break;
          continue;
        }
        block.unshift(rows[p].slice(start, end));
        if (rows[p][start]) {
          title = rows[p][start];
          break;
        }
      }
      if (!title) block.length = 0;
      const subgroups = header.kind === "npc" ? block.map((b) => b[2]).filter(Boolean).map(capitalize) : [];
      const description =
        header.kind === "npc"
          ? block
              .filter((b) => b[2])
              .map((b) => `${capitalize(b[2])}: ${b.slice(3).filter(Boolean).join(", ")}`)
              .join("\n")
          : "";

      const table: ParsedTable = {
        sheet,
        row: r + 1,
        kind: header.kind,
        className: title || sheet,
        classInfo: { hp: null, passive: "", subgroups, description },
        cards: [],
        ignoredColumns: header.ignored,
      };

      /** Rows with a single filled cell: notes, or the title of a table right below. */
      let lone: number[] = [];
      const reportLone = () => {
        for (const l of lone) {
          const text = rows[l].slice(start, end).find(Boolean)!;
          issues.push({ sheet, row: l + 1, message: `„${short(text)}“ nemá vedle sebe nic vyplněného – nebere se jako karta` });
        }
        lone = [];
      };
      let d = r + 1;
      let nextHeader = false;
      for (; d < rows.length && !isEmpty(d, start, end); d++) {
        if (detectHeader(rows[d])) {
          nextHeader = true;
          break;
        }
        if (rows[d].slice(start, end).filter(Boolean).length === 1) {
          lone.push(d);
          continue;
        }
        reportLone();
        const result =
          header.kind === "player" ? readPlayerRow(rows[d], header, d + 1, table.className) : readNpcRow(rows[d], header, d + 1);
        if (!result) continue;
        if ("issue" in result) issues.push({ sheet, row: d + 1, message: result.issue });
        else if ("info" in result) Object.assign(table.classInfo, result.info);
        else {
          table.cards.push(result.card);
          if (result.warning) issues.push({ sheet, row: d + 1, message: result.warning });
        }
      }
      // The last of them may be the title of the table that follows without an empty row.
      const nextTitle = nextHeader ? lone.pop() : undefined;
      reportLone();
      tables.push(table);
      lastEnd = nextTitle ?? d;
      r = d - 1;
    }
    summary.push({ name: sheet, tables: tables.length - before });
  }

  return { tables, issues, sheets: summary };
}
