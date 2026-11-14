import type { Metadata } from "next";
import { IconLegend } from "@/components/IconLegend";
import { REACTION_BONUS, TOLERANCE, formatPower, timeBudget } from "@/lib/power";

export const metadata: Metadata = { title: "Ikonografie" };

const TIMES = [1, 2, 3, 4, 5, 6, 7];

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

      <section className="mt-12 max-w-3xl">
        <h2 className="mb-1 font-display text-xl font-bold">Odhad síly</h2>
        <p className="mb-3 text-sm text-muted">
          Editor u každé akce sečte ceny efektů (v bodech ÚTOKU, viz „cena“ výše) a porovná je s rozpočtem pro čas
          akce podle pravidel. Reakce má rozpočet ×{formatPower(REACTION_BONUS)}. Odchylka do{" "}
          {Math.round(TOLERANCE * 100)} % je v normě.
        </p>
        <div className="panel mb-4 overflow-x-auto">
          <table className="w-full text-center text-sm tabular-nums">
            <tbody>
              <tr className="border-b border-line">
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted uppercase">Čas</th>
                {TIMES.map((t) => (
                  <td key={t} className="px-3 py-2">{t}</td>
                ))}
              </tr>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted uppercase">Rozpočet</th>
                {TIMES.map((t) => (
                  <td key={t} className="px-3 py-2 font-semibold">{formatPower(timeBudget(t, false))}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="space-y-1 text-sm text-muted">
          <li>
            · Efekty za podmínkou (RAGE: (ÚTOK +2), Cíl již Krvácel: KŘEČ), v závorce a hodnoty „+X“ / „−X“ se počítají
            zvlášť jako podmíněné. Podmínka platí do středníku nebo konce řádku. U reakce je podmínka na začátku textu
            spouštěč.
          </li>
          <li>· Škodlivý efekt na SEBE (SEBE: ZRAŇ 1) sílu snižuje. SEBE platí do středníku nebo konce řádku.</li>
          <li>
            · CÍLE X násobí efekty na cíle od VEDLE / DOSAH… po další míření za efekty, nejdál do konce řádku. Pohyb,
            PŘIPRAV, OBRANA a SKRYTÍ nenásobí. CÍL bez čísla je jen podmínka. „2x VEDLE: …“ se počítá dvakrát do
            středníku nebo konce řádku.
          </li>
          <li>· Vlastní mechaniky (RAGE, KOŘIST…), tvary oblastí, DOHLED a PLOŠNĚ cenu nemají a nepočítají se.</li>
        </ul>
      </section>
    </div>
  );
}
