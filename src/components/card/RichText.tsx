/* eslint-disable @next/next/no-img-element -- plain <img> keeps PNG export (html-to-image) simple */
import { Fragment } from "react";
import { iconSrc, splitLines, tokenizeLine } from "@/lib/keywords";
import { styles } from "./cardStyles";

type Props = {
  text: string;
  /** Show the word next to every icon, ignoring the "Vynechat text" setting. */
  showAllText?: boolean;
};

export function RichText({ text, showAllText = false }: Props) {
  const lines = splitLines(text);
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className={styles.line}>
          {tokenizeLine(line).map((t, j) => {
            if (t.type === "text") return <Fragment key={j}>{t.value}</Fragment>;
            if (t.type === "caps") return <b key={j} className={styles.caps}>{t.value}</b>;
            const withWord = showAllText || !t.keyword.hideText;
            return (
              <span key={j} className={styles.kw} title={t.keyword.key}>
                {withWord && <span className={styles.kwWord}>{t.written}</span>}
                <img src={iconSrc(t.keyword.icon)} alt={withWord ? "" : t.keyword.key} className={styles.icon} />
                {t.value && <span className={styles.kwValue}>{t.value}</span>}
              </span>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** Single keyword icon (used for headers like BONUS / POSTIH on the NPC back). */
export function KeywordIcon({ icon, alt }: { icon: string; alt: string }) {
  return <img src={iconSrc(icon)} alt={alt} className={styles.icon} />;
}
