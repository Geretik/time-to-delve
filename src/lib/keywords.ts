/**
 * Ikonografie Time to Delve.
 *
 * Tvary ikon odpovídají kategoriím z listu „Pravidla a informace“:
 *   kolečko = míření, čtverec = okamžité efekty, barevný trojúhelník = statusy.
 * `hideText` odpovídá sloupci „Vynechat text“: na kartě zůstane jen ikona (a číslo).
 */

export type KeywordCategory = "mireni" | "okamzite" | "status";

export type Keyword = {
  key: string;
  icon: string;
  category: KeywordCategory;
  hideText: boolean;
  meaning: string;
  /** Další zápisy, které se vykreslí stejnou ikonou (včetně LEGACY názvů). */
  aliases?: string[];
  /** LEGACY názvy, které ve finále nebudou. Editor na ně upozorní. */
  legacy?: string[];
  /** Odhad ceny efektu (viz lib/power.ts). Chybí, když ji pravidla neuvádějí. */
  price?: Price;
  /** Škodí tomu, na koho míří – na SEBE se cena odečte (SEBE: ZRAŇ 1 je postih). */
  harmful?: boolean;
  /** Působí na tebe (pohyb, PŘIPRAV, OBRANA, SKRYTÍ), takže ho CÍL X nenásobí. */
  self?: boolean;
};

/**
 * Sloupec „Odhad ceny efektu“ v bodech ÚTOKU:
 *   per     – za každý bod X; prvních `free` bodů je zdarma (DOSAH 1 = VEDLE),
 *   flat    – jednou, číslo za slovem se nepočítá,
 *   targets – CÍL X násobí efekty: 2 cíle = ×(1 + targets), každý další cíl přidá `targets`.
 */
export type Price = { per: number; free?: number } | { flat: number } | { targets: number };

export const CATEGORY_LABEL: Record<KeywordCategory, string> = {
  mireni: "Míření",
  okamzite: "Okamžité",
  status: "Statusy",
};

export const KEYWORDS: Keyword[] = [
  // Míření
  { key: "VEDLE", icon: "sword-brandish", category: "mireni", hideText: true, meaning: "Dosah 1 – cíl stojí vedle tebe.", price: { flat: 0 } },
  { key: "DOSAH", icon: "horizontal-flip", category: "mireni", hideText: true, meaning: "Jak daleko schopnost dosáhne (dosah 1 = vedle).", legacy: ["VZDÁLENOST", "DOSTŘEL", "RANGE"], price: { per: 0.3, free: 1 } },
  { key: "DOHLED", icon: "eye-target", category: "mireni", hideText: false, meaning: "Mezi tebou a cílem nesmí být zeď." },
  { key: "SEBE", icon: "character", category: "mireni", hideText: true, meaning: "Schopnost smí cílit pouze tebe.", price: { flat: 0 } },
  { key: "NE SEBE", icon: "character-not", category: "mireni", hideText: true, meaning: "Schopnost nesmí cílit tebe.", aliases: ["MIMO SEBE"], price: { flat: 0 } },
  { key: "CÍL", icon: "bullseye", category: "mireni", hideText: true, meaning: "Počet zasažených postav.", aliases: ["CÍLE"], legacy: ["CILE", "CIL"], price: { targets: 0.7 } },
  { key: "PLOŠNĚ", icon: "gooey-impact", category: "mireni", hideText: false, meaning: "Zásah všech v oblasti bez výběru – spojenců i nepřátel. Pro výběr cílů použij CÍLE ∞." },

  // Okamžité
  { key: "ÚTOK", icon: "dripping-blade", category: "okamzite", hideText: true, meaning: "Standardní zranění (snižuje se o Obranu).", legacy: ["UTOK"], price: { per: 1 }, harmful: true },
  { key: "PRŮRAZ", icon: "drill", category: "okamzite", hideText: false, meaning: "Útok ignoruje X bodů Obrany.", legacy: ["PIERCE"], price: { per: 0.2 }, harmful: true },
  { key: "ZRAŇ", icon: "skull-crack", category: "okamzite", hideText: false, meaning: "Čisté zranění (ignoruje Obranu i efekty).", legacy: ["HARM"], price: { per: 1.1 }, harmful: true },
  { key: "LÉČENÍ", icon: "heart-plus", category: "okamzite", hideText: true, meaning: "Okamžité doplnění X životů.", legacy: ["HEAL"], price: { per: 1.4 } },
  { key: "KROK", icon: "footprint", category: "okamzite", hideText: true, meaning: "Posun o X polí.", legacy: ["POHYB"], price: { per: 0.3 }, self: true },
  { key: "SKOK", icon: "leapfrog", category: "okamzite", hideText: true, meaning: "Posun o X polí, ignoruje figurky a terén.", price: { per: 0.8 }, self: true },
  { key: "TELEPORT", icon: "teleport", category: "okamzite", hideText: false, meaning: "Okamžitý přesun na libovolné pole v Dosahu.", price: { per: 1.2 }, self: true },
  { key: "PŘÍTAH", icon: "pull", category: "okamzite", hideText: false, meaning: "Posun nepřítele o X polí k tobě.", legacy: ["PULL"], price: { per: 0.6 } },
  { key: "ODSUN", icon: "push", category: "okamzite", hideText: false, meaning: "Posun nepřítele o X polí od tebe.", legacy: ["PUSH"], price: { per: 0.6 } },
  { key: "VPŘED", icon: "pegasus", category: "okamzite", hideText: false, meaning: "Posun na časové ose dříve.", legacy: ["QUICKEN"], price: { per: 0.9 } },
  { key: "VZAD", icon: "tortoise", category: "okamzite", hideText: false, meaning: "Posun na časové ose později.", legacy: ["DELAY"], price: { per: 1.8 }, harmful: true },
  { key: "PŘIPRAV", icon: "anticlockwise-rotation", category: "okamzite", hideText: false, meaning: "Doplní spotřebovaný předmět.", legacy: ["OBNOV"], price: { flat: 2.5 }, self: true },
  { key: "OBRANA", icon: "checked-shield", category: "okamzite", hideText: false, meaning: "Snížení příchozího zranění o X.", legacy: ["ŠTÍT"], price: { per: 1.5 }, self: true },

  // Statusy
  { key: "TLAK", icon: "backstab", category: "status", hideText: true, meaning: "Cíl dostává o 1 vyšší zranění (vzniká z karet nebo automaticky obklíčením).", legacy: ["ROZHOZENÍ", "ROZHOZEN", "ROZHOZENÝ", "OFF-GUARD"], price: { flat: 0.4 }, harmful: true },
  { key: "KRVÁCENÍ", icon: "bleeding-wound", category: "status", hideText: true, meaning: "Zraňuje každý tah. Vypne se při vyléčení.", aliases: ["KRVÁCÍ"], price: { flat: 1.6 }, harmful: true },
  { key: "HOJENÍ", icon: "healing", category: "status", hideText: true, meaning: "Léčí každý tah. Vypne se při zranění.", legacy: ["REGENERACE"], price: { flat: 1.8 } },
  { key: "KŘEČ", icon: "nailed-foot", category: "status", hideText: true, meaning: "Postava se nemůže hýbat (ale může útočit).", legacy: ["ZNEHYBNĚNÍ"], price: { flat: 2.2 }, harmful: true },
  { key: "OCHROMENÍ", icon: "drop-weapon", category: "status", hideText: true, meaning: "Postava nemůže hrát útočné akce.", aliases: ["OCHROM"], legacy: ["ODZBROJENÍ"], price: { flat: 3.6 }, harmful: true },
  { key: "SKRYTÍ", icon: "invisible", category: "status", hideText: true, meaning: "Nepřátelé tě ignorují při výběru cíle.", legacy: ["NEVIDITELNOST"], price: { flat: 2.7 }, self: true },
  { key: "BONUS", icon: "thumb-up", category: "status", hideText: true, meaning: "Pozitivní modifikátor hodu.", legacy: ["BOON"], price: { flat: 1.3 } },
  { key: "POSTIH", icon: "thumb-down", category: "status", hideText: true, meaning: "Negativní modifikátor hodu.", legacy: ["BANE"], price: { flat: 1.3 }, harmful: true },
];

export function iconSrc(icon: string) {
  return `/icons/${icon}.png`;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

export type TextToken =
  | { type: "text"; value: string }
  | { type: "keyword"; keyword: Keyword; written: string; value?: string }
  /** Jiné slovo psané VELKÝMI písmeny (RAGE, KOŘIST…) – vykreslí se zvýrazněně. */
  | { type: "caps"; value: string };

const lookup = new Map<string, Keyword>();
for (const kw of KEYWORDS) {
  for (const w of [kw.key, ...(kw.aliases ?? []), ...(kw.legacy ?? [])]) lookup.set(w, kw);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrases = [...lookup.keys()].sort((a, b) => b.length - a.length).map(escape);

// Keywords are matched only when written in capitals – lower-case words stay prose,
// so "Cíl krvácel" is plain text while "CÍL KRVÁCÍ" gets icons.
const TOKEN_RE = new RegExp(
  `(?<![\\p{L}\\d])(?:(${phrases.join("|")})(?:\\s?([+\\-−]?\\s?\\d+|∞|X))?|(\\p{Lu}[\\p{Lu}\\-]+))(?![\\p{L}])`,
  "gu",
);

export function tokenizeLine(line: string): TextToken[] {
  const out: TextToken[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", value: line.slice(last, start) });
    if (m[1]) {
      const keyword = lookup.get(m[1])!;
      out.push({ type: "keyword", keyword, written: m[1], value: m[2]?.replace(/\s/g, "") });
    } else {
      out.push({ type: "caps", value: m[3] });
    }
    last = start + m[0].length;
  }
  if (last < line.length) out.push({ type: "text", value: line.slice(last) });
  return out;
}

/** Each `;` or newline starts a new line on the card. */
export function splitLines(text: string): string[] {
  return text
    .split(/[;\n]/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** LEGACY or misspelled names found in a text, for the editor's warnings. */
export function findLegacy(text: string): { written: string; replacement: string }[] {
  const found = new Map<string, string>();
  for (const line of splitLines(text)) {
    for (const t of tokenizeLine(line)) {
      if (t.type === "keyword" && t.keyword.legacy?.includes(t.written)) {
        found.set(t.written, t.keyword.key);
      }
    }
  }
  return [...found].map(([written, replacement]) => ({ written, replacement }));
}

// Words written in lower case (legacy sheets) that the editor can convert to keywords.
const LOWER_MAP = new Map<string, string>();
for (const kw of KEYWORDS) {
  // Aliases keep their own wording (krvácí → KRVÁCÍ), legacy names become the keyword.
  for (const w of [kw.key, ...(kw.aliases ?? [])]) LOWER_MAP.set(w.toLocaleLowerCase("cs"), w);
  for (const w of kw.legacy ?? []) LOWER_MAP.set(w.toLocaleLowerCase("cs"), kw.key);
}
const LOWER_RE = new RegExp(
  `(?<![\\p{L}])(${[...LOWER_MAP.keys()].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![\\p{L}])`,
  "giu",
);

/**
 * Converts recognised words (any case, including LEGACY names) into the canonical
 * capitalised keyword, e.g. "utok 3 range 3 pull 2" → "ÚTOK 3 DOSAH 3 PŘÍTAH 2".
 */
export function normalizeKeywords(text: string): string {
  return text.replace(LOWER_RE, (m) => LOWER_MAP.get(m.toLocaleLowerCase("cs")) ?? m);
}

// The word after a match, when it is an ordinary lower-case word.
const NEXT_WORD_RE = /^\s+(\p{Ll}[\p{L}-]*)/u;

/**
 * Keyword names not written in capitals, which stay prose on the card. In texts that still use
 * LEGACY wording all of them ("utok", "krok"); otherwise only capitalised ones ("Léčení 4", "Sebe:"),
 * and not when an ordinary word follows – "Cíl již krvácel" or "Útok se zvyšuje" is a sentence,
 * as are "vedle tebe" or "cíl" in lower case. Feeds hints only.
 */
export function lowercaseKeywords(text: string): string[] {
  const legacyText = hasLegacyWords(text);
  const found = new Set<string>();
  for (const m of text.matchAll(LOWER_RE)) {
    const word = m[0];
    if (word === word.toLocaleUpperCase("cs")) continue;
    if (!legacyText) {
      if (word[0] === word[0].toLocaleLowerCase("cs")) continue;
      const next = NEXT_WORD_RE.exec(text.slice(m.index + word.length));
      if (next && !LOWER_MAP.has(next[1].toLocaleLowerCase("cs"))) continue;
    }
    found.add(word);
  }
  return [...found];
}

const LEGACY_ANY_CASE_RE = new RegExp(
  `(?<![\\p{L}])(${KEYWORDS.flatMap((k) => k.legacy ?? [])
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join("|")})(?![\\p{L}])`,
  "iu",
);

/** True when the text still uses LEGACY names in any letter case (e.g. "utok", "Pierce"). */
export function hasLegacyWords(text: string): boolean {
  return LEGACY_ANY_CASE_RE.test(text);
}
