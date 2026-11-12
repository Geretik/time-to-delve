import { describe, expect, it } from "vitest";
import { parsePlayerData } from "@/lib/cards";
import { findLegacy, hasLegacyWords, normalizeKeywords, splitLines, tokenizeLine } from "@/lib/keywords";

describe("tokenizeLine", () => {
  it("turns capitalised keywords with values into icons", () => {
    const tokens = tokenizeLine("ÚTOK 3, DOSAH 2");
    expect(tokens.map((t) => (t.type === "keyword" ? [t.keyword.key, t.value] : [t.type]))).toEqual([
      ["ÚTOK", "3"],
      ["text"],
      ["DOSAH", "2"],
    ]);
  });

  it("leaves lower-case words as prose", () => {
    expect(tokenizeLine("Cíl krvácel")).toEqual([{ type: "text", value: "Cíl krvácel" }]);
  });

  it("marks other capitalised words", () => {
    expect(tokenizeLine("RAGE")).toEqual([{ type: "caps", value: "RAGE" }]);
  });
});

describe("legacy names", () => {
  it("are normalised to the current keywords", () => {
    expect(normalizeKeywords("utok 3 range 3 pull 2")).toBe("ÚTOK 3 DOSAH 3 PŘÍTAH 2");
  });

  it("are reported with their replacement", () => {
    expect(findLegacy("UTOK 2; PIERCE 1")).toEqual([
      { written: "UTOK", replacement: "ÚTOK" },
      { written: "PIERCE", replacement: "PRŮRAZ" },
    ]);
    expect(hasLegacyWords("Pierce 1")).toBe(true);
    expect(hasLegacyWords("PRŮRAZ 1")).toBe(false);
  });
});

it("splits card text on ; and new lines", () => {
  expect(splitLines("a; b\n\n c ")).toEqual(["a", "b", "c"]);
});

it("falls back to an empty card when stored data doesn't fit the schema", () => {
  expect(parsePlayerData({ nonsense: true }).top.text).toBe("");
  expect(parsePlayerData({ top: { text: "ÚTOK 1" }, bottom: {} }).top.text).toBe("ÚTOK 1");
});
