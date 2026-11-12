"use client";
/* eslint-disable @next/next/no-img-element -- plain <img> keeps PNG export (html-to-image) simple */

import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { type ActionHalf, type CardClassInfo, type NpcCardData, type PlayerCardData } from "@/lib/cards";
import { FitText } from "./FitText";
import { KeywordIcon, RichText } from "./RichText";
import { styles } from "./cardStyles";

export const TEMPLATES = {
  player: { src: "/templates/player-front.jpg", width: 864, height: 1216, tint: 0.5 },
  npcFront: { src: "/templates/npc-front.jpg", width: 880, height: 1196, tint: 0.32 },
  /** Front of a card whose second field is an exception: one big panel instead of two. */
  npcFrontException: { src: "/templates/npc-front-exception.jpg", width: 880, height: 1196, tint: 0.32 },
  npcBack: { src: "/templates/npc-back.jpg", width: 864, height: 1216, tint: 0.32 },
} as const;

export type TemplateKey = keyof typeof TEMPLATES;
export type Variant = "base" | "upgraded";

/** Absolute box from template pixel coordinates (x1, y1) – (x2, y2). */
const at = (x1: number, y1: number, x2: number, y2: number): CSSProperties => ({
  left: x1,
  top: y1,
  width: x2 - x1,
  height: y2 - y1,
});

/** Same rectangle, but the content is laid out along its height and reads bottom to top. */
const atSideways = (x1: number, y1: number, x2: number, y2: number): CSSProperties => {
  const w = x2 - x1;
  const h = y2 - y1;
  return { left: x1 + (w - h) / 2, top: y1 + (h - w) / 2, width: h, height: w, transform: "rotate(-90deg)" };
};

function Shell({
  template,
  classInfo,
  className,
  children,
}: {
  template: TemplateKey;
  classInfo: CardClassInfo;
  className: string;
  children: ReactNode;
}) {
  const t = TEMPLATES[template];
  return (
    <>
      <img src={t.src} alt="" className={styles.bg} draggable={false} />
      {classInfo && (
        <div className={styles.tint} style={{ background: classInfo.color, opacity: t.tint }} />
      )}
      <div className={className} style={{ position: "absolute", inset: 0 }}>
        {children}
      </div>
    </>
  );
}

type FaceRootProps = { template: TemplateKey; children: ReactNode };

/** Fixed-size root in template pixels. Forward the ref for PNG export. */
export const FaceRoot = forwardRef<HTMLDivElement, FaceRootProps>(function FaceRoot({ template, children }, ref) {
  const t = TEMPLATES[template];
  return (
    <div ref={ref} className={styles.card} style={{ width: t.width, height: t.height }}>
      {children}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Player card
// ---------------------------------------------------------------------------

type PlayerProps = {
  name: string;
  data: PlayerCardData;
  classInfo: CardClassInfo;
  variant?: Variant;
  showAllText?: boolean;
};

function textFor(half: ActionHalf, variant: Variant) {
  return variant === "upgraded" && half.textUpgraded.trim() ? half.textUpgraded : half.text;
}

function PlayerHalf({
  half,
  variant,
  showAllText,
  textBox,
  circle,
  metaBox,
}: {
  half: ActionHalf;
  variant: Variant;
  showAllText: boolean;
  textBox: CSSProperties;
  circle: CSSProperties;
  metaBox: CSSProperties;
}) {
  const text = textFor(half, variant);
  return (
    <>
      <FitText
        className={styles.box}
        style={textBox}
        max={46}
        min={16}
        fitKey={`${text}|${showAllText}`}
      >
        <RichText text={text} showAllText={showAllText} />
      </FitText>
      <div className={styles.time} style={{ ...circle, fontSize: 92 }}>
        {half.time ?? ""}
        {half.reaction && half.time !== null && <span className={styles.timeR}>R</span>}
      </div>
      <div className={`${styles.box} ${styles.boxTop} ${styles.meta}`} style={metaBox}>
        {half.reaction && <span className={styles.badge}>Reakce</span>}
        {half.code && <span className={styles.code}>{half.code}</span>}
      </div>
    </>
  );
}

export function PlayerFace({ name, data, classInfo, variant = "base", showAllText = false }: PlayerProps) {
  const upgraded =
    variant === "upgraded" && (data.top.textUpgraded.trim() !== "" || data.bottom.textUpgraded.trim() !== "");
  const footer = [classInfo?.name ?? "Obecná", upgraded ? "vylepšená" : ""].filter(Boolean).join(" · ");
  return (
    <Shell template="player" classInfo={classInfo} className={styles.player}>
      <FitText
        className={`${styles.box} ${styles.title}`}
        style={at(135, 48, 730, 140)}
        max={54}
        min={24}
        singleLine
        fitKey={name}
      >
        {name}
      </FitText>

      <PlayerHalf
        half={data.top}
        variant={variant}
        showAllText={showAllText}
        textBox={at(78, 178, 648, 652)}
        circle={at(670, 173, 814, 317)}
        metaBox={at(660, 338, 826, 650)}
      />

      {data.symbol && (
        <div className={styles.gem} style={at(400, 656, 464, 720)}>
          {data.symbol}
        </div>
      )}

      <PlayerHalf
        half={data.bottom}
        variant={variant}
        showAllText={showAllText}
        textBox={at(88, 722, 648, 1112)}
        circle={at(670, 718, 814, 862)}
        metaBox={at(660, 884, 826, 1100)}
      />

      <div className={styles.footer} style={{ ...at(180, 1118, 684, 1150), color: "#d9d2c4" }}>
        {footer}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// NPC card – front
// ---------------------------------------------------------------------------

type NpcProps = {
  name: string;
  data: NpcCardData;
  classInfo: CardClassInfo;
  showAllText?: boolean;
};

export function npcFrontTemplate(data: NpcCardData): TemplateKey {
  return data.secondaryKind === "vyjimka" ? "npcFrontException" : "npcFront";
}

export function NpcFrontFace({ name, data, classInfo, showAllText = false }: NpcProps) {
  const exception = data.secondaryKind === "vyjimka";
  return (
    <Shell template={npcFrontTemplate(data)} classInfo={classInfo} className={styles.npc}>
      <FitText
        className={`${styles.box} ${styles.title}`}
        style={at(80, 58, 806, 130)}
        max={48}
        min={22}
        singleLine
        fitKey={name}
      >
        {name}
      </FitText>

      <div className={styles.box} style={{ ...at(78, 150, 624, 232), gap: 2 }}>
        <span className={styles.label}>Priorita</span>
        <FitText max={36} min={18} singleLine fitKey={data.priority} style={{ fontWeight: 600 }}>
          {data.priority}
        </FitText>
      </div>

      <div className={styles.time} style={{ ...at(652, 150, 816, 232), borderRadius: 0, fontSize: 64 }}>
        {data.time ?? ""}
      </div>

      {exception ? (
        // One panel: the main behaviour, then the exception that modifies it.
        <FitText
          className={styles.box}
          style={at(92, 300, 790, 1080)}
          max={48}
          min={16}
          fitKey={`${data.main}|${data.secondary}|${showAllText}`}
        >
          <RichText text={data.main} showAllText={showAllText} />
          {data.secondary.trim() && (
            <>
              <div className={styles.divider} />
              <RichText text={data.secondary} showAllText={showAllText} />
            </>
          )}
        </FitText>
      ) : (
        <>
          <FitText
            className={styles.box}
            style={at(92, 290, 790, 530)}
            max={48}
            min={16}
            fitKey={`${data.main}|${showAllText}`}
          >
            <RichText text={data.main} showAllText={showAllText} />
          </FitText>
          <FitText
            className={styles.box}
            style={at(92, 605, 790, 1080)}
            max={48}
            min={16}
            fitKey={`${data.secondary}|${showAllText}`}
          >
            <RichText text={data.secondary} showAllText={showAllText} />
          </FitText>
        </>
      )}

      <div className={styles.footer} style={{ ...at(150, 1092, 730, 1124), color: "#5d554a", fontSize: 22 }}>
        {[classInfo?.name ?? "Obecná", data.code].filter(Boolean).join(" · ")}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// NPC card – back (prediction)
// ---------------------------------------------------------------------------

function BackRow({
  header,
  icon,
  effect,
  headerBox,
  bodyBox,
  showAllText,
}: {
  header: string;
  icon?: { icon: string; alt: string };
  effect: string;
  headerBox: CSSProperties;
  bodyBox: CSSProperties;
  showAllText: boolean;
}) {
  return (
    <>
      <div className={`${styles.box} ${styles.npcGroup}`} style={{ ...headerBox, flexDirection: "row", fontSize: 30 }}>
        {icon && <KeywordIcon icon={icon.icon} alt={icon.alt} />}
        <span>{header}</span>
      </div>
      <FitText className={styles.box} style={bodyBox} max={42} min={16} fitKey={`${effect}|${showAllText}`}>
        {effect.trim() ? (
          <RichText text={effect} showAllText={showAllText} />
        ) : (
          <span style={{ fontSize: 60, opacity: 0.35 }}>0</span>
        )}
      </FitText>
    </>
  );
}

export function NpcBackFace({ data, classInfo, showAllText = false }: NpcProps) {
  const b = data.back;
  const group = classInfo?.name ?? "";
  return (
    <Shell template="npcBack" classInfo={classInfo} className={styles.npc}>
      <FitText
        className={`${styles.box} ${styles.title}`}
        style={at(84, 66, 790, 226)}
        max={64}
        min={24}
        fitKey={group}
      >
        {group}
      </FitText>

      <FitText
        className={`${styles.box} ${styles.title}`}
        style={atSideways(86, 292, 446, 1130)}
        max={110}
        min={28}
        fitKey={b.title}
      >
        {b.title}
      </FitText>

      <BackRow
        header={b.bonusGroup}
        icon={{ icon: "thumb-up", alt: "BONUS" }}
        effect={b.bonusEffect}
        headerBox={at(516, 280, 796, 334)}
        bodyBox={at(514, 368, 796, 546)}
        showAllText={showAllText}
      />
      <BackRow
        header={b.neutralGroup}
        effect=""
        headerBox={at(516, 590, 796, 644)}
        bodyBox={at(514, 678, 796, 856)}
        showAllText={showAllText}
      />
      <BackRow
        header={b.penaltyGroup}
        icon={{ icon: "thumb-down", alt: "POSTIH" }}
        effect={b.penaltyEffect}
        headerBox={at(516, 900, 796, 952)}
        bodyBox={at(514, 986, 796, 1150)}
        showAllText={showAllText}
      />
    </Shell>
  );
}
