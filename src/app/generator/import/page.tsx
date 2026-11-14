import type { Metadata } from "next";
import { Suspense } from "react";
import { ExcelImport } from "@/components/import/ExcelImport";
import { PageLoading } from "@/components/Loading";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Import z Excelu" };

async function Importer() {
  await requireUser();
  return <ExcelImport />;
}

export default function ImportPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-bold">Import z Excelu</h1>
      <p className="mb-6 text-sm text-muted">
        Doplní nové karty a aktualizuje existující podle sešitu, jako je <em>Time to Delve.xlsx</em>. Před uložením
        ukáže, co se změní.
      </p>

      <Suspense fallback={<PageLoading />}>
        <Importer />
      </Suspense>

      <details className="panel mt-8 p-4 text-sm text-muted">
        <summary className="cursor-pointer font-semibold text-bone">Jak má sešit vypadat</summary>
        <div className="mt-3 space-y-3">
          <p>
            Import hledá na všech listech tabulky podle řádku se záhlavím. Sloupce můžou být v libovolném pořadí,
            na velikosti písmen, diakritice a poznámkách v závorce nezáleží.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-bone">Karty hrdinů:</strong> Název karty, ID Vrch, typ vrch, čas vrch, popis vrch
              (základní), popis vrch vylepšený a totéž pro dolní akci (ID dole, Typ dole, čas dole, popis spodní…).
              Čas <code>2R</code> nebo typ „Reakce“ znamená reakci. Symbol ve středu je ze sloupce Střed nebo Info Karty.
            </li>
            <li>
              <strong className="text-bone">NPC karty:</strong> ID, Název, čas, Priorita, Hlavní chování, Výjimka nebo
              Zbytek, zadní Predikce, Bonus, Chování B, 0, Postih, Chování P.
            </li>
          </ul>
          <p>
            Tabulka končí prvním prázdným řádkem; řádek s jedinou vyplněnou buňkou (poznámka, nadpis další tabulky)
            není karta. Classa je nadpis nad tabulkou (u NPC název skupiny vlevo od řádků s podskupinami), jinak název
            listu. Řádek s názvem classy a „PAS“ pod kartami hrdiny je pasivka, ne karta.
          </p>
          <p>
            Karta se v rámci své classy páruje podle kódu (u hrdinů ID Vrch), a když ho nenajde, podle názvu. Přepíšou
            se jen pole, pro která má tabulka sloupec (Výjimka a Zbytek sdílí jedno pole: prázdná buňka ho smaže, jen
            když karta drží právě ten druh). Karty, které v sešitu nejsou, zůstanou, jak jsou – import nic nemaže.
            Chybějící classa nebo NPC skupina se vytvoří.
          </p>
        </div>
      </details>
    </div>
  );
}
