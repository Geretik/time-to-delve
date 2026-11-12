"use client";

import { useActionState } from "react";
import { inviteUser, type FormState } from "@/lib/actions/auth";

export function InviteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteUser, undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="invite-email">E-mail</label>
        <input id="invite-email" name="email" type="email" required className="field" placeholder="kolega@example.com" />
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Odesílám…" : "Poslat pozvánku"}</button>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state?.message && <p role="status" className="text-sm text-ok">{state.message}</p>}
    </form>
  );
}
