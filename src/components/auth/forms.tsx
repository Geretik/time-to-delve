"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  login,
  register,
  requestPasswordReset,
  resetPassword,
  type FormState,
} from "@/lib/actions/auth";

function Status({ state }: { state: FormState }) {
  if (state?.error) return <p role="alert" className="rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>;
  if (state?.message) return <p role="status" className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">{state.message}</p>;
  return null;
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <Status state={state} />
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" defaultValue={state?.values?.email} />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="password">Heslo</label>
          <Link href="/zapomenute-heslo" className="text-xs text-muted hover:text-gold">Zapomenuté heslo?</Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Přihlašuji…" : "Přihlásit se"}</button>
    </form>
  );
}

export function RegisterForm({ token, invitedEmail, needsCode }: { token?: string; invitedEmail?: string; needsCode: boolean }) {
  const [state, action, pending] = useActionState(register, undefined);
  return (
    <form action={action} className="space-y-4">
      <Status state={state} />
      {token && <input type="hidden" name="token" value={token} />}
      <div>
        <label className="label" htmlFor="name">Jméno</label>
        <input id="name" name="name" autoComplete="name" required className="field" defaultValue={state?.values?.name} />
      </div>
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field read-only:opacity-70"
          defaultValue={invitedEmail ?? state?.values?.email}
          readOnly={!!invitedEmail}
        />
      </div>
      <div>
        <label className="label" htmlFor="password">Heslo (aspoň 8 znaků)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="field" />
      </div>
      {needsCode && !token && (
        <div>
          <label className="label" htmlFor="invite">Zvací kód</label>
          <input id="invite" name="invite" required className="field" defaultValue={state?.values?.invite} />
        </div>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Zakládám účet…" : "Vytvořit účet"}</button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="space-y-4">
      <Status state={state} />
      <div>
        <label className="label" htmlFor="email">E-mail účtu</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" defaultValue={state?.values?.email} />
      </div>
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Odesílám…" : "Poslat odkaz"}</button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <Status state={state} />
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">Nové heslo (aspoň 8 znaků)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="field" />
      </div>
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Ukládám…" : "Nastavit heslo"}</button>
    </form>
  );
}

export { InviteForm } from "./InviteForm";
