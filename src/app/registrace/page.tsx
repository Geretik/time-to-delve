import type { Metadata } from "next";
import Link from "next/link";
import { count } from "drizzle-orm";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/forms";
import { RedirectIfSignedIn } from "@/components/auth/RedirectIfSignedIn";
import { findToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Registrace" };

async function RegisterContent({ searchParams }: { searchParams: PageProps<"/registrace">["searchParams"] }) {
  const sp = await searchParams;
  const token = typeof sp.pozvanka === "string" ? sp.pozvanka : undefined;

  if (token) {
    const invite = await findToken("invite", token);
    if (!invite) {
      return (
        <p className="text-sm text-muted">
          Pozvánka je neplatná, už byla použita, nebo vypršela. Požádej toho, kdo tě zval, o novou.
        </p>
      );
    }
    return <RegisterForm token={token} invitedEmail={invite.email ?? undefined} needsCode={false} />;
  }

  // Same order as the register action: a shared code (if configured) beats the first-account bootstrap.
  if (process.env.INVITE_CODE) return <RegisterForm needsCode />;
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n === 0) {
    return (
      <>
        <p className="mb-4 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
          Zatím tu není žádný účet – tímhle založíš první.
        </p>
        <RegisterForm needsCode={false} />
      </>
    );
  }
  return (
    <p className="text-sm text-muted">
      Registrace je jen na pozvánku. Požádej někoho z týmu, ať ti ji pošle ze stránky Tým.
    </p>
  );
}

export default function RegisterPage(props: PageProps<"/registrace">) {
  return (
    <AuthShell
      title="Registrace"
      subtitle="Účet do týmového generátoru karet."
      footer={
        <>
          Už máš účet? <Link href="/prihlaseni" className="text-gold hover:text-gold-strong">Přihlas se</Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted">Načítám…</p>}>
        <RegisterContent searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}
