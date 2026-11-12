/* eslint-disable @next/next/no-img-element */
"use client";

import { CATEGORY_LABEL, KEYWORDS, iconSrc, type KeywordCategory } from "@/lib/keywords";

const ORDER: KeywordCategory[] = ["mireni", "okamzite", "status"];

/** Clickable icon palette – inserts the keyword into the last focused text field. */
export function KeywordPalette({ onInsert, disabled }: { onInsert: (keyword: string) => void; disabled: boolean }) {
  return (
    <div className="space-y-2">
      {ORDER.map((cat) => (
        <div key={cat} className="flex flex-wrap items-center gap-1">
          <span className="w-20 shrink-0 text-[11px] font-semibold tracking-wide text-faint uppercase">
            {CATEGORY_LABEL[cat]}
          </span>
          {KEYWORDS.filter((k) => k.category === cat).map((k) => (
            <button
              key={k.key}
              type="button"
              disabled={disabled}
              // Keep focus (and the caret) in the text field we're inserting into.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert(k.key)}
              title={`${k.key} – ${k.meaning}`}
              className="group rounded p-0.5 transition hover:bg-panel-2 disabled:opacity-40"
            >
              <img src={iconSrc(k.icon)} alt={k.key} className="size-7" />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
