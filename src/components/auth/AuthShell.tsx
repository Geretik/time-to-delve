import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 font-display text-2xl font-bold tracking-wide">
        Time to Delve
      </Link>
      <div className="panel w-full max-w-sm p-6 shadow-xl shadow-black/40">
        <h1 className="font-display text-xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <div className="mt-5 text-sm text-muted">{footer}</div>}
    </div>
  );
}
