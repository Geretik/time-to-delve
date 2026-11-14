import { describe, expect, it } from "vitest";
import { lowercaseKeywords } from "@/lib/keywords";
import { estimatePower, formatDeviation, formatPower, judgePower, priceLabel, timeBudget } from "@/lib/power";

const base = (text: string) => estimatePower(text).base;

describe("estimatePower", () => {
  it("adds up the prices of the effects", () => {
    // ÚTOK 3 + KRVÁCENÍ 1,6 + KROK 2 × 0,3
    expect(base("VEDLE: ÚTOK 3, KRVÁCENÍ; KROK 2")).toBeCloseTo(5.2);
    // DOSAH 1 is free, every field above costs 0,3
    expect(base("DOSAH 3: ÚTOK 3")).toBeCloseTo(3.6);
  });

  it("counts effects in brackets and +X values as conditional", () => {
    const e = estimatePower("DOSAH 3: ÚTOK 3, CALM: (ÚTOK +2, PŘÍTAH 2)");
    expect(e.base).toBeCloseTo(3.6);
    expect(e.conditional).toBeCloseTo(3.2);
    expect(estimatePower("DOSAH 3: LÉČENÍ 3, RAGE: LÉČENÍ +1").conditional).toBeCloseTo(1.4);
  });

  it("subtracts harmful effects on SEBE until the end of the line", () => {
    expect(base("SEBE: ZRAŇ 1, TLAK;\nVEDLE: ÚTOK 3")).toBeCloseTo(3 - 1.1 - 0.4);
    expect(base("SEBE: ZRAŇ 1; ÚTOK 2")).toBeCloseTo(2 - 1.1);
    // Helpful effects on yourself still count
    expect(base("SEBE: LÉČENÍ 4, BONUS")).toBeCloseTo(5.6 + 1.3);
  });

  it("multiplies the effects of a clause by CÍLE X", () => {
    expect(base("VEDLE: ÚTOK 2; CÍLE 2")).toBeCloseTo(3.4);
    expect(base("DOSAH 4: CÍLE 3; ÚTOK 2")).toBeCloseTo(0.9 + 2 * 2.4);
    // Movement is not multiplied, a new targeting word starts a new clause
    expect(base("KROK 5; CÍL 2; ÚTOK 1")).toBeCloseTo(1.5 + 1.7);
    expect(base("DOSAH 2, CÍLE 2: BONUS; SEBE: KROK 1")).toBeCloseTo(0.3 + 1.3 * 1.7 + 0.3);
  });

  it("reads DOHLED, PLOŠNĚ and NE SEBE as part of the targeting before them", () => {
    expect(base("DOSAH 2, DOHLED, CÍLE 2: ÚTOK 3")).toBeCloseTo(0.3 + 5.1);
    expect(base("DOSAH 2, CÍLE 2, DOHLED: ÚTOK 3")).toBeCloseTo(0.3 + 5.1);
    expect(base("DOSAH 3, CÍLE 3, NE SEBE: ÚTOK 2")).toBeCloseTo(0.6 + 4.8);
    expect(base("2x DOSAH 2, DOHLED: ÚTOK 2")).toBeCloseTo(0.3 + 4);
  });

  it("counts targets added under a condition as conditional", () => {
    const e = estimatePower("DOSAH 2: ÚTOK 2, RAGE: (CÍLE 3)");
    expect(e.base).toBeCloseTo(2.3);
    expect(e.conditional).toBeCloseTo(2 * 1.4);
    // Conditional effects reach the extra targets too
    expect(estimatePower("DOSAH 2: ÚTOK 2, RAGE: (CÍLE +1, ÚTOK +1)").conditional).toBeCloseTo(1.4 + 1.7);
  });

  it("does not multiply effects on yourself or on the next line", () => {
    expect(base("DOSAH 3, CÍLE 3: ÚTOK 2; SKRYTÍ")).toBeCloseTo(0.6 + 4.8 + 2.7);
    expect(base("DOSAH 3, CÍLE 3: ÚTOK 2;\nOBRANA 2")).toBeCloseTo(0.6 + 4.8 + 3);
    // "Rozděl" splits VPŘED among the targets of the line above
    expect(base("DOSAH 2, CÍLE 2: BONUS;\nRozděl VPŘED 4 mezi zacílené")).toBeCloseTo(0.3 + 1.3 * 1.7 + 3.6);
  });

  it("reads CÍL without a number and words before a colon as a condition", () => {
    const e = estimatePower("VEDLE: ÚTOK 2, CÍL KRVÁCÍ: (ÚTOK +1, TLAK)");
    expect(e.base).toBeCloseTo(2);
    expect(e.conditional).toBeCloseTo(1.4);
  });

  it("repeats a clause written as 2x until the end of the line", () => {
    expect(base("2x VEDLE: ÚTOK 2")).toBeCloseTo(4);
    expect(base("2X VEDLE: ÚTOK 2")).toBeCloseTo(4);
    expect(base("2x VEDLE: ÚTOK 2;\nKROK 3")).toBeCloseTo(4 + 0.9);
    expect(base("2x VEDLE: ÚTOK 2; KROK 3")).toBeCloseTo(4 + 0.9);
    // A ";" inside a bracket doesn't end it
    expect(estimatePower("2x VEDLE: ÚTOK 2, RAGE: (ÚTOK +1; TLAK)").conditional).toBeCloseTo(2 + 0.8);
  });

  it("reads effects after a condition as conditional until the end of the line", () => {
    // Seed cards: the condition has no bracket
    const krvacel = estimatePower("SEBE: ZRAŇ 2;\nOBLOUK PLOŠNĚ: ÚTOK 2, KRVÁCENÍ, Cíl již Krvácel: KŘEČ");
    expect(krvacel.base).toBeCloseTo(-2.2 + 2 + 1.6);
    expect(krvacel.conditional).toBeCloseTo(2.2);
    const korist = estimatePower("KROK 1;\nSEBE: HOJENÍ, PŘIPRAV boty;\nMáš-li alespoň 2 KOŘISTI: PŘIPRAV libovolný.");
    expect(korist.base).toBeCloseTo(0.3 + 1.8 + 2.5);
    expect(korist.conditional).toBeCloseTo(2.5);
    expect(estimatePower("VEDLE: ÚTOK 3, KRVÁCENÍ: ÚTOK 1").conditional).toBeCloseTo(1);
    // ";" ends the condition, a condition ending its line covers the next one
    expect(base("VEDLE: ÚTOK 3; Cíl již Krvácel: KŘEČ; KROK 2")).toBeCloseTo(3.6);
    expect(estimatePower("VEDLE: ÚTOK 3;\nRAGE:\nKROK 2").conditional).toBeCloseTo(0.6);
    // −X is a modifier like +X
    expect(base("VEDLE: ÚTOK 4, ÚTOK −1")).toBeCloseTo(4);
  });

  it("reads all keywords of a compound condition as the condition", () => {
    const e = estimatePower("KROK 3; PŘIPRAV zbraň nebo náhodný předmět\nVEDLE KRVÁCÍ nebo CALM:\n(PŘIPRAV další náhodný předmět)");
    expect(e.base).toBeCloseTo(0.9 + 2.5);
    expect(e.conditional).toBeCloseTo(2.5);
    const nebo = estimatePower("ÚTOK 3, KŘEČ NEBO TLAK: ÚTOK +2");
    expect(nebo.base).toBeCloseTo(3);
    expect(nebo.conditional).toBeCloseTo(2);
    expect(nebo.unpriced).toEqual([]);
  });

  it("reads area shapes before a colon as targeting", () => {
    expect(base("OBLOUK: ÚTOK 2; KRVÁCENÍ")).toBeCloseTo(3.6);
    expect(base("LINIE (2–4 pole): ÚTOK 6")).toBeCloseTo(6);
    expect(base("DOSAH 2, Ttrojúhelník (3 pole): ÚTOK 4")).toBeCloseTo(4.3);
  });

  it("reads the opening condition of a reaction as its trigger", () => {
    const text = "Nepřítel ukončí kolo vedle tebe: VEDLE: ÚTOK 2, KRVÁCENÍ";
    expect(estimatePower(text, { reaction: true }).base).toBeCloseTo(3.6);
    expect(estimatePower(text).conditional).toBeCloseTo(3.6);
    expect(estimatePower("KOŘIST se pohne v DOSAHU 3:\nDOSAH 3: ÚTOK 5.", { reaction: true }).base).toBeCloseTo(5.6);
  });

  it("reads each line on its own", () => {
    expect(estimatePower("ÚTOK\n3").noValue).toEqual(["ÚTOK"]);
    // An unclosed bracket doesn't make the next lines conditional
    const e = estimatePower("VEDLE: ÚTOK 2, RAGE: (ÚTOK +1;\nKROK 2; LÉČENÍ 3");
    expect(e.base).toBeCloseTo(2 + 0.6 + 4.2);
    expect(e.conditional).toBeCloseTo(1);
  });

  it("reports what it could not price", () => {
    const e = estimatePower("OBLOUK PLOŠNĚ: ÚTOK 4; DOHLED: VZAD 2; každý KROK; DOSAH 2, CÍLE ∞: BONUS; v DOSAHU");
    expect(e.base).toBeCloseTo(4 + 3.6 + 0.3 + 1.3);
    expect(e.unpriced).toEqual(["OBLOUK", "PLOŠNĚ", "DOHLED"]);
    expect(e.noValue).toEqual(["KROK", "CÍLE ∞"]);
  });

  it("lists custom mechanics that only start like a keyword, not inflected keywords", () => {
    expect(estimatePower("VEDLE: TLAKOVÁ VLNA: ÚTOK 2").unpriced).toEqual(["TLAKOVÁ", "VLNA"]);
    expect(estimatePower("SEBEVĚDOMÍ, KROKODÝL").unpriced).toEqual(["SEBEVĚDOMÍ", "KROKODÝL"]);
    expect(estimatePower("2x VEDLE: ÚTOK 2, CÍL již KRVÁCEL: (TLAK); v DOSAHU, TLAKEM, SEBOU").unpriced).toEqual([]);
  });

  it("ignores keywords that are not in capitals and lists them", () => {
    const e = estimatePower("utok 3 range 3");
    expect(e.items).toEqual([]);
    expect(e.lowercase).toEqual(["utok", "range"]);
  });
});

describe("lowercaseKeywords", () => {
  it("lists capitalised keywords, but leaves ordinary lower-case words alone", () => {
    expect(lowercaseKeywords("Sebe Léčení 4, cíl stojí vedle tebe")).toEqual(["Sebe", "Léčení"]);
  });

  it("leaves capitalised words that start a sentence alone", () => {
    expect(lowercaseKeywords("VEDLE: ÚTOK 4, KRVÁCENÍ, Cíl krvácel před útokem: (KŘEČ)")).toEqual([]);
    expect(lowercaseKeywords("Cíl stojí vedle tebe: ÚTOK 2")).toEqual([]);
    expect(lowercaseKeywords("SEBE: Hojení; Útok 3")).toEqual(["Hojení", "Útok"]);
  });

  it("lists every keyword in texts with LEGACY wording", () => {
    expect(lowercaseKeywords("krok 2 push 4")).toEqual(["krok", "push"]);
  });
});

describe("budget", () => {
  it("follows the curve from the rules and extends it past 7 times", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((t) => timeBudget(t, false))).toEqual([1, 2, 3.5, 5, 7, 9, 12]);
    expect(timeBudget(8, false)).toBe(15);
    expect(timeBudget(2, true)).toBe(3);
    // The editor holds a typed 2.5 until it's saved
    expect(timeBudget(2.5, false)).toBeCloseTo(2.75);
  });

  it("judges the deviation from the budget", () => {
    expect(judgePower(5.4, 4, false)).toMatchObject({ budget: 5, level: "ok" });
    expect(judgePower(6.5, 4, false)?.level).toBe("warn");
    expect(judgePower(2, 4, false)?.level).toBe("bad");
    expect(judgePower(3, null, false)).toBeNull();
    expect(judgePower(3, 0, false)).toBeNull();
    expect(judgePower(3, Number.NaN, false)).toBeNull();
  });
});

it("formats numbers the Czech way", () => {
  expect(formatPower(5.25)).toBe("5,3");
  expect(formatPower(-1.1)).toBe("−1,1");
  expect(formatPower(-5.25)).toBe("−5,3");
  expect(formatPower(-0.04)).toBe("0,0");
  expect(formatDeviation(0.084)).toBe("+8 %");
  expect(formatDeviation(-0.2)).toBe("−20 %");
  expect(priceLabel({ per: 0.3, free: 1 })).toBe("0,3 za bod nad 1");
  expect(priceLabel({ flat: 0 })).toBe("zdarma");
  expect(priceLabel({ targets: 0.7 })).toBe("2 cíle = ×1,7");
});
