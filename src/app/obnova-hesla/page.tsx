import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/forms";
import { findToken } from "@/lib/auth";

export const metadata: Metadata = { title: "Nové heslo" };

async function ResetContent({ searchParams }: { searchParams: PageProps<"/obnova-hesla">["searchParams"] }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  if (!(await findToken("reset", token))) {
    return (
      <p className="text-sm text-muted">
        Odkaz je neplatný nebo vypršel.{" "}
        <Link href="/zapomenute-heslo" className="text-gold hover:text-gold-strong">Požádej o nový.</Link>
      </p>
    );
  }
  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage(props: PageProps<"/obnova-hesla">) {
  return (
    <AuthShell title="Nové heslo">
      <Suspense fallback={<p className="text-sm text-muted">Ověřuji odkaz…</p>}>
        <ResetContent searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}
