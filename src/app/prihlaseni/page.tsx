import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/forms";
import { RedirectIfSignedIn } from "@/components/auth/RedirectIfSignedIn";

export const metadata: Metadata = { title: "Přihlášení" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Přihlášení"
      subtitle="Generátor karet je jen pro tým Time to Delve."
      footer={
        <>
          Máš pozvánku? <Link href="/registrace" className="text-gold hover:text-gold-strong">Vytvoř si účet</Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <LoginForm />
    </AuthShell>
  );
}
