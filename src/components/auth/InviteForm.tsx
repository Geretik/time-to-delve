"use client";

import { useActionState, useState } from "react";
import { createInvite, type InviteState } from "@/lib/actions/auth";

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={link}
        className="field font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Odkaz pozvánky"
      />
      <button
        type="button"
        className="btn shrink-0 px-3"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Zkopírováno" : "Kopírovat"}
      </button>
    </div>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvite, undefined);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <div>
          <label className="label" htmlFor="invite-note">Pro koho (poznámka)</label>
          <input
            id="invite-note"
            name="note"
            maxLength={200}
            className="field"
            placeholder="např. Kryštof – balanc NPC"
            defaultValue={state?.values?.note}
          />
        </div>
        <div>
          <label className="label" htmlFor="invite-email">E-mail (nepovinné u odkazu)</label>
          <input
            id="invite-email"
            name="email"
            type="email"
            className="field"
            placeholder="kolega@example.com"
            defaultValue={state?.values?.email}
          />
          <p className="mt-1 text-xs text-faint">S e-mailem půjde účet založit jen na tuto adresu.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button name="mode" value="link" className="btn btn-primary" disabled={pending}>
            Vytvořit odkaz
          </button>
          <button name="mode" value="email" className="btn" disabled={pending}>
            Poslat e-mailem
          </button>
        </div>
      </form>

      {pending && <p className="text-sm text-muted">Vytvářím pozvánku…</p>}
      {!pending && state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {!pending && state?.message && <p role="status" className="text-sm text-ok">{state.message}</p>}
      {!pending && state?.link && <CopyLink link={state.link} />}
    </div>
  );
}
