/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Suspense } from "react";
import { CardView } from "@/components/card/CardView";
import { getCurrentUser } from "@/lib/auth";
import { KEYWORDS, iconSrc } from "@/lib/keywords";
import seed from "@/lib/db/seed-data.json";

type SeedCard = (typeof seed.cards)[number];

const classBySlug = new Map(seed.classes.map((c) => [c.slug, c]));
const pick = (name: string) => seed.cards.find((c) => c.name === name) as SeedCard;
const info = (c: SeedCard) => {
  const cls = classBySlug.get(c.classSlug);
  return cls ? { name: cls.name, color: cls.color } : null;
};

const SHOWCASE = [pick("Odveta"), pick("Nezastavitelnost"), pick("Verdikt")];
const NPC = pick("Mrtvolný dopad");

const HEROES = [
  {
    slug: "barbar",
    text: "Na konci kola získá FURY, když zabil nepřítele nebo stojí vedle něj, jinak CALM. RAGE nastane, když má FURY a pořád stojí u nepřítele.",
  },
  {
    slug: "strelec",
    text: "Označuje nepřátele jako KOŘIST. Útoky na kořist a na nepřátele daleko na časové ose (POZDĚ) jsou silnější a ODRAZ přenese útok na další cíl.",
  },
  {
    slug: "sermir",
    text: "INICIACE platí, jen když je karta první akcí tahu. Dvě karty se stejným symbolem v jednom tahu stojí každá o 1 čas méně (FLOW).",
  },
];

const FEATURES = [
  {
    title: "Čas místo kol",
    text: "Každá akce stojí čas a posouvá postavu po časové ose. Silnější akce stojí víc – a nepřítel mezitím může jednat. VPŘED a VZAD posouvají postavy na ose dříve nebo později.",
  },
  {
    title: "Dvě akce na kartě",
    text: "Karta hrdiny má horní a spodní akci, každou s vlastní cenou v čase. Reakční akce se spouštějí mimo tah – třeba když nepřítel skončí kolo vedle tebe.",
  },
  {
    title: "Nepřátelé s plánem",
    text: "NPC hrají podle karet chování s prioritou cíle. Rub karty předpovídá, kterou skupinu nepřátel posílí bonus a kterou postih.",
  },
];

/** "Generátor" for signed-in team members, "Přihlásit" for everyone else. */
async function AccountLink() {
  const user = await getCurrentUser();
  return user ? (
    <Link href="/generator" className="btn ml-2 px-3 py-1.5" title={`Přihlášen: ${user.name}`}>
      Generátor
    </Link>
  ) : (
    <Link href="/prihlaseni" className="btn ml-2 px-3 py-1.5">
      Přihlásit
    </Link>
  );
}

export default function Home() {
  const statuses = KEYWORDS.filter((k) => k.category === "status");
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-5 sm:px-6">
        <span className="font-display text-lg font-bold tracking-wide">Time to Delve</span>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <a href="#o-hre" className="hidden rounded-md px-3 py-1.5 text-muted hover:text-bone sm:inline">O hře</a>
          <a href="#hrdinove" className="hidden rounded-md px-3 py-1.5 text-muted hover:text-bone sm:inline">Hrdinové</a>
          <Suspense fallback={<span className="btn invisible ml-2 px-3 py-1.5" aria-hidden>Přihlásit</span>}>
            <AccountLink />
          </Suspense>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(200,161,90,0.12),transparent_60%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-16">
            <div>
              <p className="mb-3 text-sm font-semibold tracking-[0.2em] text-gold uppercase">Desková hra ve vývoji</p>
              <h1 className="font-display text-5xl leading-[1.05] font-bold sm:text-6xl">Time to Delve</h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                Taktická výprava do podzemí, kde nerozhoduje pořadí kol, ale čas. Každý úder, krok i reakce něco
                stojí – a nepřátelé nečekají.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/generator" className="btn btn-primary px-5 py-2.5 text-base">Do generátoru karet</Link>
                <a href="#o-hre" className="btn px-5 py-2.5 text-base">Jak hra funguje</a>
              </div>
            </div>
            <div className="relative mx-auto flex h-[360px] w-full max-w-[520px] items-center justify-center sm:h-[420px]">
              {SHOWCASE.map((c, i) => (
                <div
                  key={c.name}
                  className="absolute drop-shadow-[0_18px_30px_rgba(0,0,0,0.6)]"
                  style={{ transform: `translateX(${(i - 1) * 46}%) rotate(${(i - 1) * 9}deg) translateY(${i === 1 ? -14 : 10}px)`, zIndex: i === 1 ? 2 : 1 }}
                >
                  <CardView kind="player" name={c.name} data={c.data} classInfo={info(c)} width={230} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* About */}
        <section id="o-hre" className="border-t border-line bg-panel/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="font-display text-3xl font-bold">O hře</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="panel p-5">
                  <h3 className="font-display text-lg font-bold text-gold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-16 grid items-center gap-10 lg:grid-cols-[auto_1fr]">
              <div className="flex justify-center gap-4">
                <CardView kind="npc" name={NPC.name} data={NPC.data} classInfo={info(NPC)} width={200} />
                <CardView kind="npc" name={NPC.name} data={NPC.data} classInfo={info(NPC)} width={200} side="back" />
              </div>
              <div>
                <h3 className="font-display text-2xl font-bold">Líc a rub NPC karty</h3>
                <p className="mt-3 max-w-xl leading-relaxed text-muted">
                  Líc říká, co nepřítel udělá: čas akce, koho si vybere za cíl a hlavní chování. Rub s predikcí
                  ukazuje, jak se tah promítne do tří skupin nepřátel – jedna dostane bonus, druhá nic a třetí postih.
                </p>
                <div className="mt-6">
                  <p className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">Statusy</p>
                  <ul className="flex flex-wrap gap-3">
                    {statuses.map((s) => (
                      <li key={s.key} className="flex items-center gap-2 text-sm" title={s.meaning}>
                        <img src={iconSrc(s.icon)} alt="" className="size-7" />
                        {s.key}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Heroes */}
        <section id="hrdinove" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="font-display text-3xl font-bold">Hrdinové</h2>
            <p className="mt-2 max-w-2xl text-muted">
              Každá classa má vlastní balíček karet a vlastní pasivní mechaniku. Další hrdinové – elementalista,
              paladin a jiní – jsou ve vývoji.
            </p>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {HEROES.map((h) => {
                const cls = classBySlug.get(h.slug)!;
                return (
                  <div key={h.slug} className="panel overflow-hidden">
                    <div className="h-1.5" style={{ background: cls.color }} />
                    <div className="p-5">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-display text-xl font-bold">{cls.name}</h3>
                        {cls.hp != null && <span className="text-sm text-muted">{cls.hp} životů</span>}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{h.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Generator */}
        <section className="border-t border-line bg-panel/40">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-20 sm:px-6 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <h2 className="font-display text-3xl font-bold">Generátor karet pro tým</h2>
              <p className="mt-3 max-w-xl leading-relaxed text-muted">
                Karty tvoříme ve sdílené knihovně. Stačí napsat text jako „VEDLE: ÚTOK 3, KRVÁCENÍ“ – klíčová slova se
                sama promění v ikony a karta se vykreslí do finální šablony. Hotovou kartu stáhneš jako PNG pro tisk.
              </p>
              <ul className="mt-5 space-y-1.5 text-sm text-muted">
                <li>· karty hrdinů i NPC (líc i rub) s živým náhledem</li>
                <li>· classy a NPC skupiny s vlastní barvou, nebo obecné karty pro všechny</li>
                <li>· ikonografie podle pravidel, upozornění na zastaralé názvy</li>
              </ul>
            </div>
            <div className="panel p-6 text-center">
              <p className="text-sm text-muted">Generátor je přístupný jen členům týmu.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Link href="/prihlaseni" className="btn btn-primary px-5 py-2.5">Přihlásit se</Link>
                <Link href="/registrace" className="btn px-5 py-2.5">Mám pozvánku</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-faint sm:px-6">
          <span className="font-display text-sm text-muted">Time to Delve</span>
          <span>
            Ikony:{" "}
            <a href="https://game-icons.net" className="underline hover:text-muted" target="_blank" rel="noreferrer">
              game-icons.net
            </a>{" "}
            (CC BY 3.0)
          </span>
        </div>
      </footer>
    </div>
  );
}
