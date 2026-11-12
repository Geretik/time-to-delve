import { z } from "zod";

const text = z.string().max(2000).default("");
const time = z.number().int().min(0).max(99).nullable().default(null);

export const actionHalfSchema = z.object({
  code: z.string().max(20).default(""),
  reaction: z.boolean().default(false),
  time,
  text,
  textUpgraded: text,
});

export const playerCardDataSchema = z.object({
  top: actionHalfSchema,
  bottom: actionHalfSchema,
  /** Symbol ve středovém drahokamu (např. FLOW symbol šermíře). */
  symbol: z.string().max(4).default(""),
  note: text,
});

export const npcCardDataSchema = z.object({
  code: z.string().max(20).default(""),
  time,
  priority: z.string().max(200).default(""),
  main: text,
  secondaryKind: z.enum(["zbytek", "vyjimka"]).default("zbytek"),
  secondary: text,
  back: z.object({
    title: z.string().max(200).default(""),
    panel: text,
    bonusGroup: z.string().max(100).default(""),
    bonusEffect: z.string().max(500).default(""),
    neutralGroup: z.string().max(100).default(""),
    penaltyGroup: z.string().max(100).default(""),
    penaltyEffect: z.string().max(500).default(""),
  }),
});

export type ActionHalf = z.infer<typeof actionHalfSchema>;
export type PlayerCardData = z.infer<typeof playerCardDataSchema>;
export type NpcCardData = z.infer<typeof npcCardDataSchema>;

export type CardKind = "player" | "npc";

export const cardInputSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.uuid().optional(),
    kind: z.literal("player"),
    name: z.string().trim().min(1, "Karta musí mít název.").max(120),
    classId: z.uuid().nullable(),
    data: playerCardDataSchema,
  }),
  z.object({
    id: z.uuid().optional(),
    kind: z.literal("npc"),
    name: z.string().trim().min(1, "Karta musí mít název.").max(120),
    classId: z.uuid().nullable(),
    data: npcCardDataSchema,
  }),
]);

export type CardInput = z.infer<typeof cardInputSchema>;

/** What the card renderer needs to know about the owning class. */
export type CardClassInfo = {
  name: string;
  color: string;
} | null;

export function emptyHalf(): ActionHalf {
  return { code: "", reaction: false, time: null, text: "", textUpgraded: "" };
}

export function emptyPlayerData(): PlayerCardData {
  return { top: emptyHalf(), bottom: emptyHalf(), symbol: "", note: "" };
}

export function emptyNpcData(): NpcCardData {
  return {
    code: "",
    time: null,
    priority: "",
    main: "",
    secondaryKind: "zbytek",
    secondary: "",
    back: {
      title: "",
      panel: "",
      bonusGroup: "",
      bonusEffect: "",
      neutralGroup: "",
      penaltyGroup: "",
      penaltyEffect: "",
    },
  };
}

/** Parse stored JSON defensively so older rows keep rendering after schema changes. */
export function parsePlayerData(data: unknown): PlayerCardData {
  const r = playerCardDataSchema.safeParse(data);
  return r.success ? r.data : emptyPlayerData();
}

export function parseNpcData(data: unknown): NpcCardData {
  const r = npcCardDataSchema.safeParse(data);
  return r.success ? r.data : emptyNpcData();
}

export const SECONDARY_LABEL: Record<NpcCardData["secondaryKind"], string> = {
  zbytek: "Zbytek",
  vyjimka: "Výjimka",
};
