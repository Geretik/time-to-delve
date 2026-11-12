import type { Metadata } from "next";
import { IconLegend } from "@/components/IconLegend";

export const metadata: Metadata = { title: "Ikonografie" };

export default function IconsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-bold">Ikonografie</h1>
      <p className="mb-6 max-w-3xl text-sm text-muted">
        Klíčové slovo napsané v textu karty VELKÝMI písmeny se vykreslí touto ikonou. Číslo za slovem (ÚTOK 3,
        DOSAH 2…) zůstane vedle ikony. U slov označených „jen ikona“ se text vynechá, v náhledu to jde přepnout
        volbou „Text u všech ikon“. Ostatní slova psaná velkými písmeny (RAGE, KOŘIST…) se jen zvýrazní.
      </p>
      <IconLegend />
    </div>
  );
}
