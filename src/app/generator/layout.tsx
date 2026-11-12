import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";

const NAV = [
  { href: "/generator", label: "Karty" },
  { href: "/generator/classy", label: "Classy" },
  { href: "/generator/ikony", label: "Ikonografie" },
  { href: "/generator/tym", label: "Tým" },
];

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <form action={logout} className="flex items-center gap-3">
      <span className="hidden text-sm text-muted sm:inline">{user.name}</span>
      <button className="btn btn-ghost px-2 py-1 text-sm text-muted">Odhlásit</button>
    </form>
  );
}

export default function GeneratorLayout({ children }: LayoutProps<"/generator">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-panel/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="font-display text-lg font-bold tracking-wide text-bone">
            Time to Delve
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 text-muted hover:bg-panel-2 hover:text-bone">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <Suspense fallback={null}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
