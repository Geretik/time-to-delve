"use client";

import { removeMember } from "@/lib/actions/auth";

export function RemoveMemberButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={removeMember.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(`Opravdu odebrat „${name}“ z týmu? Účet se smaže, karty zůstanou.`)) e.preventDefault();
      }}
    >
      <button className="btn btn-danger px-2.5 py-1 text-xs">Odebrat</button>
    </form>
  );
}
