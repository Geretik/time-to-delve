import { describe, expect, it } from "vitest";
import { legacyNpcPanel, npcGroupName, parseNpcData } from "@/lib/cards";

describe("legacyNpcPanel", () => {
  it("finds text left in the removed left panel, which parsing drops", () => {
    const stored = { back: { title: "HNIJÍCÍ TICHO", panel: "  VEDLE: ÚTOK 2 " } };
    expect(legacyNpcPanel(stored)).toBe("VEDLE: ÚTOK 2");
    expect(parseNpcData(stored).back).not.toHaveProperty("panel");
  });

  it("ignores cards without it", () => {
    expect(legacyNpcPanel({ back: { panel: "  " } })).toBe("");
    expect(legacyNpcPanel({ back: {} })).toBe("");
    expect(legacyNpcPanel({})).toBe("");
    expect(legacyNpcPanel(null)).toBe("");
  });
});

it("names an NPC card without a class as general", () => {
  expect(npcGroupName(null)).toBe("Obecná");
  expect(npcGroupName({ name: "Nemrtví", color: "#000" })).toBe("Nemrtví");
});
