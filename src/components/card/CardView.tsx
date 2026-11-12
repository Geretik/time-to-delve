"use client";

import { forwardRef, type ReactNode } from "react";
import type { CardClassInfo, CardKind, NpcCardData, PlayerCardData } from "@/lib/cards";
import { parseNpcData, parsePlayerData } from "@/lib/cards";
import { FaceRoot, NpcBackFace, NpcFrontFace, PlayerFace, TEMPLATES, type TemplateKey, type Variant } from "./CardFaces";

type ScaledProps = { template: TemplateKey; width: number; children: ReactNode; className?: string };

/** Renders a card face at `width` CSS pixels; the ref points at the unscaled face for export. */
export const ScaledFace = forwardRef<HTMLDivElement, ScaledProps>(function ScaledFace(
  { template, width, children, className },
  ref,
) {
  const t = TEMPLATES[template];
  const scale = width / t.width;
  return (
    <div className={className} style={{ width, height: Math.round(t.height * scale), position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <FaceRoot ref={ref} template={template}>
          {children}
        </FaceRoot>
      </div>
    </div>
  );
});

export type FaceSide = "front" | "back";

type CardViewProps = {
  kind: CardKind;
  name: string;
  data: unknown;
  classInfo: CardClassInfo;
  width: number;
  side?: FaceSide;
  variant?: Variant;
  showAllText?: boolean;
  className?: string;
};

/** Any card, any side – used for thumbnails and previews. */
export const CardView = forwardRef<HTMLDivElement, CardViewProps>(function CardView(
  { kind, name, data, classInfo, width, side = "front", variant = "base", showAllText = false, className },
  ref,
) {
  if (kind === "player") {
    return (
      <ScaledFace ref={ref} template="player" width={width} className={className}>
        <PlayerFace
          name={name}
          data={parsePlayerData(data) as PlayerCardData}
          classInfo={classInfo}
          variant={variant}
          showAllText={showAllText}
        />
      </ScaledFace>
    );
  }
  const npc = parseNpcData(data) as NpcCardData;
  return side === "back" ? (
    <ScaledFace ref={ref} template="npcBack" width={width} className={className}>
      <NpcBackFace name={name} data={npc} classInfo={classInfo} showAllText={showAllText} />
    </ScaledFace>
  ) : (
    <ScaledFace ref={ref} template="npcFront" width={width} className={className}>
      <NpcFrontFace name={name} data={npc} classInfo={classInfo} showAllText={showAllText} />
    </ScaledFace>
  );
});
