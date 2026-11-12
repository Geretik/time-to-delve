import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Zapomenuté heslo" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Zapomenuté heslo"
      subtitle="Pošleme ti e-mail s odkazem na nastavení nového hesla."
      footer={<Link href="/prihlaseni" className="text-gold hover:text-gold-strong">Zpět na přihlášení</Link>}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
