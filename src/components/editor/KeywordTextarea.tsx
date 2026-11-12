"use client";

import { useId } from "react";
import { findLegacy, hasLegacyWords, normalizeKeywords } from "@/lib/keywords";

export type ActiveField = { el: HTMLTextAreaElement | HTMLInputElement; set: (value: string) => void };

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onActivate: (field: ActiveField) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
};

/** Textarea for card text: registers itself for the icon palette and flags legacy wording. */
export function KeywordTextarea({ label, value, onChange, onActivate, rows = 3, placeholder, hint }: Props) {
  const id = useId();
  const legacy = findLegacy(value);
  // Offer the conversion only for legacy wording – ordinary prose ("vedle tebe") stays untouched.
  const normalized = hasLegacyWords(value) ? normalizeKeywords(value) : value;
  const canNormalize = normalized !== value;

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <textarea
        id={id}
        className="field font-mono text-[13px] leading-relaxed"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => onActivate({ el: e.currentTarget, set: onChange })}
      />
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
      {legacy.length > 0 && (
        <p className="mt-1 text-xs text-gold">
          Zastaralé nebo nepřesné názvy:{" "}
          {legacy.map((l) => `${l.written} → ${l.replacement}`).join(", ")}
        </p>
      )}
      {canNormalize && (
        <div className="mt-1.5 rounded-md border border-line bg-ink/60 p-2 text-xs">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-muted">Po převodu na klíčová slova:</span>
            <button type="button" className="font-semibold text-gold hover:text-gold-strong" onClick={() => onChange(normalized)}>
              Převést
            </button>
          </div>
          <p className="font-mono whitespace-pre-wrap text-bone/80">{normalized}</p>
        </div>
      )}
    </div>
  );
}
