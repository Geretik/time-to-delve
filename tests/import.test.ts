import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import readXlsxFile from "read-excel-file/node";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyImport, previewImport } from "@/lib/actions/import";
import { createSession } from "@/lib/auth";
import { parseNpcData, parsePlayerData } from "@/lib/cards";
import { cards, classes } from "@/lib/db/schema";
import { parseWorkbook, type ParsedWorkbook, type SheetInput } from "@/lib/import/excel";
import { planImport, type ExistingCard, type ExistingClass, type ImportInput } from "@/lib/import/plan";
import { createUser, db, resetDb } from "./db";
import { Redirect } from "./next-fakes";

const WORKBOOK = fileURLToPath(new URL("../podklady/Time to Delve.xlsx", import.meta.url));

let sheets: SheetInput[];
beforeAll(async () => {
  sheets = await readXlsxFile(WORKBOOK);
});

/** The sheets with one cell changed; `row`/`col` are 1-based like in Excel. */
function withCell(sheet: string, row: number, col: number, value: unknown): SheetInput[] {
  return sheets.map((s) => {
    if (s.sheet !== sheet) return s;
    const data = s.data.map((r) => [...r]);
    while (data.length < row) data.push([]);
    data[row - 1][col - 1] = value;
    return { sheet: s.sheet, data };
  });
}

const input = (wb: ParsedWorkbook) => ({ tables: wb.tables });

describe("parseWorkbook on podklady/Time to Delve.xlsx", () => {
  it("finds the hero and NPC tables and names their classes", () => {
    const wb = parseWorkbook(sheets);
    expect(wb.tables.map((t) => [t.sheet, t.kind, t.className, t.cards.length])).toEqual([
      ["HOTOVÉ POSTAVY", "player", "Barbar", 10],
      ["HOTOVÉ POSTAVY", "player", "Střelec", 10],
      ["HOTOVÉ POSTAVY", "player", "Šermíř", 10],
      ["NPC 2", "npc", "nemrtví", 9],
      ["NPC 2", "npc", "havěť", 9],
      ["NPC 2", "npc", "střelci", 9],
      ["NPC ukázka", "npc", "nemrtví", 9],
    ]);
    // Vele-zvěř and banditi have other columns.
    expect(wb.issues.map((i) => [i.sheet, i.row])).toEqual([
      ["NPC 2", 52],
      ["NPC 2", 67],
    ]);
    expect(wb.issues[0].message).toContain("Hlavní chování");
  });

  it("reads the class rows and NPC subgroups", () => {
    const [barbar, strelec] = parseWorkbook(sheets).tables;
    expect(barbar.classInfo.hp).toBe(22);
    expect(barbar.classInfo.passive).toMatch(/^Na konci kola:\npokud jsi zabil/);
    expect(strelec.classInfo.hp).toBe(14); // "14 zivotů"
    expect(barbar.cards.map((c) => c.name)).not.toContain("BARBAR");
    const havet = parseWorkbook(sheets).tables[4];
    expect(havet.classInfo.subgroups).toEqual(["Potkani", "Hadi", "Pavouci"]);
    expect(havet.classInfo.description).toMatch(/^Potkani: Prašivý potkan, Morový potkan, Vypelichaný potkan\n/);
  });

  it("turns 2R into a reaction and fills the fields", () => {
    const odveta = parseWorkbook(sheets).tables[0].cards[1];
    expect(odveta).toMatchObject({
      row: 4,
      name: "Odveta",
      fields: { "top.code": "B11", "top.time": 2, "top.reaction": true, "bottom.time": 4, "bottom.reaction": false },
    });
    const ztuhlost = parseWorkbook(sheets).tables[3].cards[2];
    expect(ztuhlost.fields).toMatchObject({ code: "XN3", exception: "plné životy: ÚTOK 3", rest: "" });
  });
});

describe("parseWorkbook on other layouts", () => {
  const sheet = (data: unknown[][]): SheetInput[] => [{ sheet: "Mág", data }];

  it("takes the sheet name when there is no title and columns in any order", () => {
    const wb = parseWorkbook(
      sheet([
        ["Poznámka nahoře, daleko od tabulky"],
        [],
        [],
        [],
        ["popis dole", "Název karty", "popis vrch", "čas vrch"],
        ["KROK 2", "Blesk", "ÚTOK 3", "3R"],
        [],
        ["Poznámka pod tabulkou"],
      ]),
    );
    expect(wb.tables).toHaveLength(1);
    expect(wb.tables[0].className).toBe("Mág");
    expect(wb.tables[0].cards).toEqual([
      {
        row: 6,
        name: "Blesk",
        fields: { "top.time": 3, "top.reaction": true, "top.text": "ÚTOK 3", "bottom.text": "KROK 2" },
      },
    ]);
  });

  it("skips rows it can't read and says why", () => {
    const wb = parseWorkbook(
      sheet([
        ["ID", "Název", "čas", "Hlavní chování", "Výjimka", "Zbytek"],
        ["X1", "Dobrá", 5, "ÚTOK 1", "", "KROK 1"],
        ["X2", "Špatný čas", "hodně", "ÚTOK 1"],
        ["X3", "", 4, "ÚTOK 2"],
        ["X4", "Obojí", 4, "ÚTOK 2", "OBRANA 1", "KROK 1"],
      ]),
    );
    expect(wb.tables[0].cards.map((c) => c.name)).toEqual(["Dobrá", "Obojí"]);
    expect(wb.tables[0].cards[1].fields).toMatchObject({ exception: "OBRANA 1", rest: "KROK 1" });
    expect(wb.issues.map((i) => i.row)).toEqual([3, 4, 5]);
  });

  const HERO_HEADER = ["Název karty", "ID Vrch", "čas vrch", "popis vrch", "popis dole"];

  it("doesn't take notes or the next table's title for cards", () => {
    const wb = parseWorkbook(
      sheet([
        ["Paladin"],
        HERO_HEADER,
        ["Světlo", "P01", 2, "LÉČENÍ 2", "ÚTOK 3"],
        ["Pozn.: dořešit balanc"],
        ["Štít", "P11", 3, "OBRANA 2", "KROK 1"],
        ["Jen název"],
        ["Střelec"],
        [...HERO_HEADER, "Barevný filter"],
        ["Rozvaha", "S01", 2, "KROK 1", "ÚTOK 2"],
        ["Poznámka pod tabulkou"],
        ["Kostra", "", "", "", "", "červená"],
      ]),
    );
    expect(wb.tables.map((t) => [t.className, t.cards.map((c) => c.name)])).toEqual([
      ["Paladin", ["Světlo", "Štít"]],
      ["Střelec", ["Rozvaha"]],
    ]);
    expect(wb.issues.map((i) => [i.row, i.message])).toEqual([
      [4, expect.stringContaining("„Pozn.: dořešit balanc“ nemá vedle sebe nic vyplněného")],
      [6, expect.stringContaining("„Jen název“")],
      [10, expect.stringContaining("„Poznámka pod tabulkou“")],
      [11, "Kostra: kromě názvu nemá nic vyplněného – přeskočena"],
    ]);
  });

  it("keeps a card named like its class; the class row has PAS or hit points", () => {
    const wb = parseWorkbook(
      sheet([
        ["Paladin"],
        HERO_HEADER,
        ["Paladin", "P01", 2, "ÚTOK 3", "KROK 1"],
        ["PALADIN", "", "", "Aura", "20 životů"],
      ]),
    );
    expect(wb.tables[0].cards.map((c) => c.name)).toEqual(["Paladin"]);
    expect(wb.tables[0].classInfo).toMatchObject({ hp: 20, passive: "Aura" });
    expect(wb.issues).toEqual([]);
  });

  it("survives a cell holding an invalid date", () => {
    const wb = parseWorkbook([...sheets, { sheet: "(LEGACY) rozbitý", data: [[new Date(Number.NaN)]] }]);
    expect(wb.tables).toHaveLength(7);
  });
});

describe("planImport", () => {
  const barbar: ExistingClass = { id: "class-barbar", name: "Barbar", kind: "hero", subgroups: [] };
  const nemrtvi: ExistingClass = { id: "class-nemrtvi", name: "Nemrtví", kind: "npc", subgroups: [] };
  const npcCard = (name: string, data: object): ExistingCard => ({ id: `card-${name}`, kind: "npc", classId: nemrtvi.id, name, data });
  const table = (kind: "player" | "npc", className: string, cards: ImportInput["tables"][number]["cards"]) => ({
    sheet: "List",
    row: 1,
    kind,
    className,
    classInfo: { hp: null, passive: "", subgroups: [], description: "" },
    cards,
  });

  it("keeps stored fields the current schema rejects instead of resetting the card", () => {
    const stored: ExistingCard = {
      id: "card-1",
      kind: "player",
      classId: barbar.id,
      name: "Pohotovost",
      // Too long a symbol, and no "note" (older data).
      data: {
        top: { code: "B01", reaction: false, time: 3, text: "KROK 1", textUpgraded: "KROK 3" },
        bottom: { code: "B02", reaction: false, time: 5, text: "ZRAŇ 1", textUpgraded: "ZRAŇ 2" },
        symbol: "ABCDE",
      },
    };
    const textOnly = { tables: [table("player", "Barbar", [{ row: 3, name: "Pohotovost", fields: { "top.text": "KROK 2" } }])] };
    expect(planImport(textOnly, [barbar], [stored]).cards[0]).toMatchObject({
      status: "skip",
      message: expect.stringMatching(/^Symbol ve středu: nejvýš 4 znaků – takhle je to uložené v generátoru/),
    });

    const withSymbol = { tables: [table("player", "Barbar", [{ row: 3, name: "Pohotovost", fields: { "top.text": "KROK 2", symbol: "#" } }])] };
    const [card] = planImport(withSymbol, [barbar], [stored]).cards;
    expect(card).toMatchObject({
      status: "update",
      changes: [
        { field: "Horní akce – text", from: "KROK 1", to: "KROK 2" },
        { field: "Symbol ve středu", from: "ABCDE", to: "#" },
      ],
    });
    expect(card.data).toMatchObject({ top: { code: "B01", time: 3, textUpgraded: "KROK 3" }, bottom: { code: "B02" }, note: "" });
  });

  it("only overwrites Výjimka/Zbytek of the kind the table has a column for", () => {
    const rest = npcCard("Zbytkář", { code: "X1", main: "ÚTOK 1", secondaryKind: "zbytek", secondary: "KROK 2; ÚTOK 1", back: {} });
    const exception = npcCard("Výjimkář", { code: "X2", main: "ÚTOK 1", secondaryKind: "vyjimka", secondary: "OBRANA 1", back: {} });
    const plan = (fields: Record<string, string>) =>
      planImport(
        { tables: [table("npc", "Nemrtví", [{ row: 2, name: "Zbytkář", fields }, { row: 3, name: "Výjimkář", fields }])] },
        [nemrtvi],
        [rest, exception],
      ).cards.map((c) => [c.status, c.changes]);

    expect(plan({ exception: "" })).toEqual([
      ["same", []],
      ["update", [{ field: "Druhé pole – text", from: "OBRANA 1", to: "" }]],
    ]);
    expect(plan({ exception: "", rest: "" })).toEqual([
      ["update", [{ field: "Druhé pole – text", from: "KROK 2; ÚTOK 1", to: "" }]],
      ["update", [{ field: "Druhé pole – text", from: "OBRANA 1", to: "" }]],
    ]);
    expect(plan({ exception: "plné životy: ÚTOK 3" })[0]).toEqual([
      "update",
      [
        { field: "Druhé pole", from: "Zbytek", to: "Výjimka" },
        { field: "Druhé pole – text", from: "KROK 2; ÚTOK 1", to: "plné životy: ÚTOK 3" },
      ],
    ]);
  });

  it("matches new cards against each other like existing ones", () => {
    const rows = [
      { row: 3, name: "Světlo", fields: { "top.code": "P01", "top.text": "LÉČENÍ 2" } },
      { row: 4, name: "Světlo", fields: { "top.code": "", "top.text": "LÉČENÍ 3" } },
      { row: 5, name: "Záře", fields: { "top.code": "P01", "top.text": "LÉČENÍ 4" } },
    ];
    const { cards, newClasses } = planImport({ tables: [table("player", "Paladin", rows)] }, [], []);
    expect(cards.map((c) => [c.status, c.message])).toEqual([
      ["create", null],
      ["duplicate", "stejná karta je už výš: list „List“, řádek 3"],
      ["duplicate", "stejná karta je už výš: list „List“, řádek 3"],
    ]);
    expect(newClasses.map((c) => c.name)).toEqual(["Paladin"]);
  });

  it("doesn't call a copy a duplicate when the first one can't be imported", () => {
    const code = "B01-PŘÍLIŠ-DLOUHÝ-KÓD-KARTY";
    const rows = [
      { row: 3, name: "Pohotovost", fields: { "top.code": code, "top.text": "KROK 1" } },
      { row: 9, name: "Pohotovost", fields: { "top.code": code, "top.text": "KROK 1" } },
    ];
    expect(planImport({ tables: [table("player", "Barbar", rows)] }, [barbar], []).cards.map((c) => [c.status, c.message])).toEqual([
      ["skip", "Horní akce – kód: nejvýš 20 znaků"],
      ["skip", "stejná karta je už výš (list „List“, řádek 3) a ta nejde importovat – oprav ji tam"],
    ]);
  });

  it("reports what the class can't hold per row instead of rejecting the workbook", () => {
    const rules = "Na začátku kola si každý hráč líže tři karty. ".repeat(6);
    const rows = [{ row: 3, name: "Světlo", fields: { "top.text": "LÉČENÍ 2" } }];
    const plan = planImport(
      {
        tables: [
          table("player", rules, rows),
          { ...table("player", "Obr", rows), classInfo: { hp: 1000, passive: "", subgroups: [], description: "" } },
        ],
      },
      [],
      [],
    );
    expect(plan.cards.map((c) => [c.status, c.message])).toEqual([
      ["skip", "název classy nad tabulkou je delší než 60 znaků"],
      ["skip", "životy classy (1000) musí být mezi 0 a 999"],
    ]);
    expect(plan.newClasses).toEqual([]);
  });

  it("refuses to guess between classes of the same name", () => {
    const rows = [{ row: 3, name: "Pohotovost", fields: { "top.text": "KROK 1" } }];
    const plan = planImport({ tables: [table("player", "barbar", rows)] }, [barbar, { ...barbar, id: "class-barbar-2" }], []);
    expect(plan.cards[0]).toMatchObject({ status: "skip", message: expect.stringContaining("v generátoru je víc class „Barbar“") });
  });
});

/** The database as `npm run db:seed` fills it from the same workbook. */
async function seed() {
  const data = JSON.parse(readFileSync(new URL("../src/lib/db/seed-data.json", import.meta.url), "utf8"));
  const ids = new Map<string, string>();
  for (const c of data.classes) {
    const [row] = await db.insert(classes).values(c).returning({ id: classes.id });
    ids.set(c.slug, row.id);
  }
  for (const c of data.cards) {
    await db.insert(cards).values({ kind: c.kind, classId: ids.get(c.classSlug)!, name: c.name, data: c.data });
  }
  return ids;
}

async function cardByName(name: string) {
  const [row] = await db.select().from(cards).where(eq(cards.name, name));
  return row;
}

describe("import", () => {
  beforeEach(async () => {
    await resetDb();
    await createSession((await createUser("a@example.com")).id);
  });

  it("needs a signed-in user", async () => {
    await resetDb();
    await expect(previewImport(input(parseWorkbook(sheets)))).rejects.toThrow(Redirect);
    await expect(applyImport(input(parseWorkbook(sheets)), "token")).rejects.toThrow(Redirect);
  });

  it("changes nothing when the database holds what the workbook says", async () => {
    await seed();
    const res = await previewImport(input(parseWorkbook(sheets)));
    if (!res.ok) throw new Error(res.error);
    const byStatus = Object.groupBy(res.preview.cards, (c) => c.status);
    expect(byStatus.same).toHaveLength(57);
    expect(byStatus.create).toBeUndefined();
    expect(byStatus.update).toBeUndefined();
    expect(byStatus.skip).toBeUndefined();
    // The "NPC ukázka" copy of the undead table.
    expect(byStatus.duplicate).toHaveLength(9);
    expect(byStatus.duplicate![0]).toMatchObject({ sheet: "NPC ukázka", message: "stejná karta je už výš: list „NPC 2“, řádek 8" });
    expect(res.preview.newClasses).toEqual([]);
  });

  it("updates changed cards, adds new ones and their class", async () => {
    await seed();
    // Pohotovost gets a new top text; a new Barbar card and a new class sheet.
    let changed = withCell("HOTOVÉ POSTAVY", 3, 5, "KROK 2; PŘIPRAV zbraň");
    changed = changed.map((s) =>
      s.sheet === "HOTOVÉ POSTAVY" ? { ...s, data: [...s.data.slice(0, 12), ["Řev", "B99", null, 2, "SEBE: BONUS", null, null, "B98", null, 3, "VEDLE: ÚTOK 2"], ...s.data.slice(12)] } : s,
    );
    changed.push({
      sheet: "Rozpracované",
      data: [
        ["Paladin"],
        ["Název karty", "ID Vrch", "čas vrch", "popis vrch", "ID dole", "čas dole", "popis dole"],
        ["Světlo", "P01", 2, "LÉČENÍ 2", "P02", 4, "ÚTOK 3"],
        ["PALADIN", "PPAS", null, "Aura: spojenci vedle tebe mají OBRANA 1", null, null, "20 životů"],
      ],
    });
    const wb = parseWorkbook(changed);

    const res = await previewImport(input(wb));
    if (!res.ok) throw new Error(res.error);
    const update = res.preview.cards.filter((c) => c.status === "update");
    expect(update).toEqual([
      expect.objectContaining({
        name: "Pohotovost",
        changes: [{ field: "Horní akce – text", from: "KROK 1; PŘIPRAV zbraň nebo náhodný předmět", to: "KROK 2; PŘIPRAV zbraň" }],
      }),
    ]);
    expect(res.preview.cards.filter((c) => c.status === "create").map((c) => [c.name, c.className])).toEqual([
      ["Řev", "Barbar"],
      ["Světlo", "Paladin"],
    ]);
    expect(res.preview.newClasses).toEqual([{ name: "Paladin", kind: "hero", cards: 1 }]);

    const applied = await applyImport(input(wb), res.preview.token);
    expect(applied).toEqual({ ok: true, created: 2, updated: 1, classes: 1 });

    expect(parsePlayerData((await cardByName("Pohotovost")).data).top.text).toBe("KROK 2; PŘIPRAV zbraň");
    const rev = parsePlayerData((await cardByName("Řev")).data);
    expect(rev).toMatchObject({ top: { code: "B99", time: 2, text: "SEBE: BONUS" }, bottom: { code: "B98", time: 3 } });
    const [paladin] = await db.select().from(classes).where(eq(classes.name, "Paladin"));
    expect(paladin).toMatchObject({ slug: "paladin", kind: "hero", hp: 20, passive: "Aura: spojenci vedle tebe mají OBRANA 1" });
    expect((await cardByName("Světlo")).classId).toBe(paladin.id);

    // Importing the same file again finds nothing to do.
    const again = await previewImport(input(wb));
    if (!again.ok) throw new Error(again.error);
    expect(again.preview.cards.filter((c) => c.status === "create" || c.status === "update")).toEqual([]);
  });

  it("matches by code, so a card renamed in Excel keeps its identity", async () => {
    await seed();
    const wb = parseWorkbook(withCell("NPC 2", 8, 2, "Krvavá milost"));
    const res = await previewImport(input(wb));
    if (!res.ok) throw new Error(res.error);
    expect(res.preview.cards.find((c) => c.row === 8 && c.sheet === "NPC 2")).toMatchObject({
      status: "update",
      changes: [{ field: "Název", from: "Krvavé milosrdenství", to: "Krvavá milost" }],
    });
    await applyImport(input(wb), res.preview.token);
    expect(await cardByName("Krvavé milosrdenství")).toBeUndefined();
    expect(parseNpcData((await cardByName("Krvavá milost")).data).code).toBe("XN1");
  });

  it("keeps the class's spelling of subgroups on the back", async () => {
    await seed();
    const res = await previewImport(input(parseWorkbook(withCell("NPC 2", 23, 9, "PAVOUCI"))));
    if (!res.ok) throw new Error(res.error);
    expect(res.preview.cards.find((c) => c.name === "Volání roje")).toMatchObject({
      status: "update",
      changes: [{ field: "Bonus – skupina", from: "Potkani", to: "Pavouci" }],
    });
  });

  it("refuses to guess between cards sharing a code", async () => {
    const ids = await seed();
    const pohotovost = await cardByName("Pohotovost");
    await db.update(cards).set({ name: "Pohotovost 2" }).where(eq(cards.id, pohotovost.id));
    await db.insert(cards).values({ kind: "player", classId: ids.get("barbar")!, name: "Pohotovost 3", data: pohotovost.data });

    const res = await previewImport(input(parseWorkbook(sheets)));
    if (!res.ok) throw new Error(res.error);
    expect(res.preview.cards.find((c) => c.name === "Pohotovost")).toMatchObject({
      status: "skip",
      message: expect.stringContaining("kód B01 má víc karet"),
    });
    // A copy made in the app keeps the code, but the original is still found by its name.
    await db.update(cards).set({ name: "Pohotovost" }).where(eq(cards.id, pohotovost.id));
    const res2 = await previewImport(input(parseWorkbook(sheets)));
    if (!res2.ok) throw new Error(res2.error);
    expect(res2.preview.cards.find((c) => c.name === "Pohotovost")).toMatchObject({ status: "same", cardId: pohotovost.id });
  });

  it("reports values the card can't hold instead of importing them", async () => {
    await seed();
    const res = await previewImport(input(parseWorkbook(withCell("HOTOVÉ POSTAVY", 3, 2, "B01-PŘÍLIŠ-DLOUHÝ-KÓD-KARTY"))));
    if (!res.ok) throw new Error(res.error);
    expect(res.preview.cards.find((c) => c.name === "Pohotovost")).toMatchObject({
      status: "skip",
      message: "Horní akce – kód: nejvýš 20 znaků",
    });
  });

  it("turns away malformed input", async () => {
    expect(await previewImport({ tables: [{ kind: "boss" }] })).toEqual({ ok: false, error: expect.any(String) });
    expect(await applyImport("nic", "token")).toEqual({ ok: false, error: expect.any(String) });
    expect(await applyImport(input(parseWorkbook(sheets)), undefined)).toEqual({ ok: false, error: expect.any(String) });
    expect(await db.select().from(cards)).toEqual([]);
  });

  it("accepts a workbook with a long paragraph above a table", async () => {
    await seed();
    const long = "Pravidla: ".concat("každý hráč na začátku kola líže tři karty a jednu odhodí. ".repeat(5));
    const res = await previewImport(input(parseWorkbook(withCell("HOTOVÉ POSTAVY", 1, 1, long))));
    if (!res.ok) throw new Error(res.error);
    expect(res.preview.cards.filter((c) => c.status === "skip")).toHaveLength(10);
    expect(res.preview.cards.find((c) => c.status === "skip")!.message).toBe("název classy nad tabulkou je delší než 60 znaků");
  });

  it("writes nothing when the cards changed since the preview", async () => {
    await seed();
    const wb = parseWorkbook(withCell("HOTOVÉ POSTAVY", 3, 5, "KROK 2; PŘIPRAV zbraň"));
    const res = await previewImport(input(wb));
    if (!res.ok) throw new Error(res.error);

    const pohotovost = await cardByName("Pohotovost");
    const data = parsePlayerData(pohotovost.data);
    await db.update(cards).set({ data: { ...data, top: { ...data.top, text: "Někdo to mezitím upravil" } } }).where(eq(cards.id, pohotovost.id));

    const applied = await applyImport(input(wb), res.preview.token);
    expect(applied).toMatchObject({ ok: false, error: expect.stringContaining("mezitím změnily") });
    if (applied.ok || !applied.preview) throw new Error("expected a fresh preview");
    expect(applied.preview.cards.find((c) => c.name === "Pohotovost")!.changes).toEqual([
      { field: "Horní akce – text", from: "Někdo to mezitím upravil", to: "KROK 2; PŘIPRAV zbraň" },
    ]);
    expect(parsePlayerData((await cardByName("Pohotovost")).data).top.text).toBe("Někdo to mezitím upravil");

    expect(await applyImport(input(wb), applied.preview.token)).toMatchObject({ ok: true, updated: 1 });
  });

  it("waits for an import running at the same time and plans against its cards", async () => {
    const paladin: SheetInput = {
      sheet: "Paladin",
      data: [
        ["Název karty", "ID Vrch", "čas vrch", "popis vrch", "popis dole"],
        ["Světlo", "P01", 2, "LÉČENÍ 2", "ÚTOK 3"],
      ],
    };
    const data = input(parseWorkbook([paladin]));
    const res = await previewImport(data);
    if (!res.ok) throw new Error(res.error);

    // Another import holds the lock (same key as in lib/actions/import.ts) and creates the card.
    let applying!: ReturnType<typeof applyImport>;
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('import-z-excelu'))`);
      applying = applyImport(data, res.preview.token);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const [cls] = await tx.insert(classes).values({ slug: "paladin", name: "Paladin", kind: "hero" }).returning();
      await tx.insert(cards).values({ kind: "player", classId: cls.id, name: "Světlo", data: { top: { code: "P01" } } });
    });

    expect(await applying).toMatchObject({ ok: false, error: expect.stringContaining("mezitím změnily") });
    expect(await db.select().from(cards).where(eq(cards.name, "Světlo"))).toHaveLength(1);
    expect(await db.select().from(classes).where(eq(classes.name, "Paladin"))).toHaveLength(1);
  });
});
