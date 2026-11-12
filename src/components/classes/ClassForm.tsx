"use client";

import { useActionState, useState } from "react";
import { saveClass, type ClassFormState } from "@/lib/actions/classes";

export type ClassFormValues = {
  id?: string;
  name: string;
  kind: "hero" | "npc";
  color: string;
  hp: number | null;
  passive: string;
  description: string;
  subgroups: string[];
  sortOrder: number;
};

export function ClassForm({ initial, submitLabel }: { initial: ClassFormValues; submitLabel: string }) {
  const [state, action, pending] = useActionState<ClassFormState, FormData>(saveClass, undefined);
  const [kind, setKind] = useState(initial.kind);
  const [color, setColor] = useState(initial.color);

  return (
    <form action={action} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div>
          <label className="label" htmlFor="cls-name">Název</label>
          <input id="cls-name" name="name" className="field" defaultValue={initial.name} required />
        </div>
        <div>
          <label className="label" htmlFor="cls-kind">Druh</label>
          <select
            id="cls-kind"
            name="kind"
            className="field"
            value={kind}
            onChange={(e) => setKind(e.target.value as "hero" | "npc")}
          >
            <option value="hero">Classa hrdiny</option>
            <option value="npc">NPC skupina</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="cls-color">Barva (tónuje rámeček karty)</label>
          <div className="flex items-center gap-2">
            <input
              id="cls-color"
              type="color"
              className="h-9 w-12 cursor-pointer rounded border border-line bg-ink"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <input name="color" className="field font-mono" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>
        {kind === "hero" && (
          <div>
            <label className="label" htmlFor="cls-hp">Životy</label>
            <input id="cls-hp" name="hp" type="number" min={0} className="field" defaultValue={initial.hp ?? ""} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="cls-order">Pořadí</label>
          <input id="cls-order" name="sortOrder" type="number" min={0} className="field" defaultValue={initial.sortOrder} />
        </div>
      </div>

      {kind === "npc" && (
        <div>
          <label className="label" htmlFor="cls-sub">Podskupiny (oddělené čárkou – Bonus, 0, Postih na rubu karty)</label>
          <input id="cls-sub" name="subgroups" className="field" defaultValue={initial.subgroups.join(", ")} placeholder="Kostlivci, Zombie, Ghulové" />
        </div>
      )}

      {kind === "hero" && (
        <div>
          <label className="label" htmlFor="cls-passive">Pasivní schopnost</label>
          <textarea id="cls-passive" name="passive" rows={6} className="field" defaultValue={initial.passive} />
        </div>
      )}

      <div>
        <label className="label" htmlFor="cls-desc">Popis / poznámky</label>
        <textarea id="cls-desc" name="description" rows={3} className="field" defaultValue={initial.description} />
      </div>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Ukládám…" : submitLabel}
        </button>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        {state?.saved && !pending && <p className="text-sm text-ok">Uloženo.</p>}
      </div>
    </form>
  );
}
