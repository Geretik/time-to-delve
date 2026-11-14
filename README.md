# Time to Delve

Web hry Time to Delve: veřejná úvodní stránka a týmový generátor karet (za přihlášením).

- **Karty hrdinů** (líc) a **NPC karty** (líc + rub s predikcí) se vykreslují do šablon v `public/templates`
  (viz [Šablony karet](#šablony-karet)).
- **Classy a NPC skupiny** mají vlastní barvu, která tónuje rámeček karty. Karta bez classy je obecná.
- **Ikonografie:** klíčové slovo psané VELKÝMI písmeny (`ÚTOK 3`, `DOSAH 2`, `KRVÁCENÍ`…) se vykreslí ikonou
  z `podklady/TTD_Ikony`. Mapování a pravidla jsou v [src/lib/keywords.ts](src/lib/keywords.ts).
- **Odhad síly:** editor u každé akce sečte ceny efektů z listu „Pravidla a informace“ a porovná je s rozpočtem
  pro její čas (1 čas ≈ ÚTOK 1 … 7 časů ≈ ÚTOK 12, reakce ×1,5). Ceny jsou v [src/lib/keywords.ts](src/lib/keywords.ts),
  výpočet v [src/lib/power.ts](src/lib/power.ts), vysvětlení pro tým na stránce Ikonografie.
- Export karty do PNG v rozlišení šablony (864 × 1216 px).
- **Import z Excelu** (Karty → Import z Excelu): doplní a aktualizuje karty ze sešitu, jako je
  `podklady/Time to Delve.xlsx`. Viz [Import z Excelu](#import-z-excelu).
- Účty: registrace jen na e-mailovou pozvánku (stránka Tým), obnova hesla e-mailem přes Resend.

## Stack

Next.js 16 (App Router, Cache Components) · Postgres + Drizzle ORM · Tailwind CSS 4 · nasazení na Vercel + Neon.

## Lokální vývoj

```bash
npm install
cp .env.example .env.local        # výchozí hodnoty míří na lokální Postgres z docker-compose
docker compose up -d              # Postgres na portu 54329
npm run db:migrate                # vytvoří tabulky
npm run db:seed                   # nahraje classy a karty z podkladů (jen do prázdné databáze)
npm run dev
```

Na http://localhost:3000/registrace si založ první účet (dokud v databázi žádný není, registrace je otevřená).
Bez `RESEND_API_KEY` se e-maily (pozvánky, obnova hesla) jen vypíšou do konzole serveru.

## Testy

```bash
docker compose up -d   # testy běží proti Postgresu z docker-compose
npm test               # nebo npm run test:watch
```

Testy (Vitest, složka `tests/`) si založí vlastní databázi `ttd_test`, před každým během ji smažou a aplikují
migrace – vývojová data v `ttd` zůstanou. Jinou databázi jde zadat přes `TEST_DATABASE_URL`; její název musí
končit na `_test`.

## Proměnné prostředí

| Proměnná | Popis |
| --- | --- |
| `DATABASE_URL` | Postgres. Na Vercelu ji nastaví integrace Neon (`DATABASE_URL_UNPOOLED` se použije pro migrace). |
| `RESEND_API_KEY` | API klíč z [resend.com](https://resend.com) pro odesílání e-mailů. |
| `EMAIL_FROM` | Odesílatel, např. `Time to Delve <karty@tvoje-domena.cz>`. Doména musí být ověřená v Resendu. |
| `APP_URL` | Adresa webu pro odkazy v e-mailech. Na Vercelu se doplní sama z produkční domény. |
| `INVITE_CODE` | Nepovinný sdílený zvací kód pro registraci bez e-mailové pozvánky. |
| `BACKUP_PASSPHRASE` | Nepovinné: heslo, kterým `npm run db:backup` šifruje zálohu a `npm run db:restore` ji rozšifruje (viz [Zálohy](#zálohy)). |
| `CRON_SECRET` | Jen na Vercelu: tajemství, kterým se Vercel Cron prokazuje při denním úklidu prošlých přihlášení a pozvánek (`/api/cron/prune`, rozvrh ve `vercel.json`). |

## CI a nasazení

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) při každém pushi a pull requestu spustí lint,
typecheck, testy proti Postgresu a produkční build. Push do `main`, který projde, se nasadí na Vercel do produkce
(`vercel deploy --prod`; Vercel při buildu aplikuje migrace).

Nasazení z Actions potřebuje v repozitáři na GitHubu:

| Kde | Název | Hodnota |
| --- | --- | --- |
| Secret | `VERCEL_TOKEN` | Token z https://vercel.com/account/tokens (`gh secret set VERCEL_TOKEN`) |
| Variable | `VERCEL_ORG_ID` | `orgId` z `.vercel/project.json` |
| Variable | `VERCEL_PROJECT_ID` | `projectId` z `.vercel/project.json` |

Ručně jde nasadit pořád přes `npx vercel deploy --prod`.

## Změny databáze

Schéma je v [src/lib/db/schema.ts](src/lib/db/schema.ts). Po změně spusť `npm run db:generate`, commitni
vzniklou migraci ve složce `drizzle/`. Na Vercelu se při každém buildu (`npm run vercel-build`) aplikují migrace
a do prázdné databáze se nahrají data z podkladů. Chybějící karty z podkladů jde doplnit `npm run db:seed -- --doplnit`.

## Zálohy

Každou noc (02:30 UTC) GitHub Action [Záloha databáze](.github/workflows/backup.yml) zazálohuje produkční
databázi a uloží ji jako artefakt běhu na 90 dní. Repozitář je veřejný a jeho artefakty si může stáhnout kdokoli
s účtem na GitHubu, proto je záloha vždy zašifrovaná heslem `BACKUP_PASSPHRASE`. Obsahuje classy, karty a účty.
Přihlášení, e-mailové odkazy a rate limity jsou krátkodobé, takže se z nich zálohuje jen struktura tabulek.
Mimo plán jde zálohu spustit v Actions → Záloha databáze → Run workflow.

Action potřebuje v repozitáři dva secrets:

| Secret | Hodnota |
| --- | --- |
| `BACKUP_DATABASE_URL` | `DATABASE_URL_UNPOOLED` z nastavení projektu na Vercelu (přímé spojení do Neonu bez pooleru). |
| `BACKUP_PASSPHRASE` | Dlouhé náhodné heslo, např. z `openssl rand -base64 32`. Ulož si ho i mimo GitHub (správce hesel): secret z GitHubu už přečíst nejde a bez hesla zálohu neobnovíš. |

Ve veřejném repozitáři GitHub plánované běhy vypne po 60 dnech bez commitu. Pak je v Actions znovu zapni.

Ruční záloha a obnova potřebují Docker (`pg_dump` a `pg_restore` běží z image `postgres`):

```bash
npm run db:backup                           # DATABASE_URL → zalohy/ttd-<čas>.dump, s BACKUP_PASSPHRASE zašifrovaná
npm run db:restore -- zalohy/<soubor>       # obnova do DATABASE_URL, před přepsáním se zeptá
```

Obnova nahradí schémata `public` a `drizzle` obsahem zálohy v jedné transakci. Všechno zapsané od zálohy se ztratí
a všichni se musí znovu přihlásit. Když je záloha starší než kód, skript na konci připomene `npm run db:migrate`.

Zálohu z GitHubu obnovíš tak, že v běhu Action stáhneš artefakt, rozbalíš zip a spustíš:

```bash
read -rs BACKUP_PASSPHRASE && export BACKUP_PASSPHRASE   # heslo se nezapíše do historie shellu
npm run db:restore -- ttd-2026-11-14T02-30Z.dump.enc
```

Bez dalšího nastavení míří obnova do databáze z `.env.local`. Do produkce obnovíš, když předtím v shellu nastavíš
`DATABASE_URL` na `DATABASE_URL_UNPOOLED` z Vercelu (proměnná z prostředí má přednost před `.env.local`).

## Data z podkladů

`src/lib/db/seed-data.json` je převod listů „HOTOVÉ POSTAVY“ (Barbar, Střelec, Šermíř) a „NPC 2“ (Nemrtví,
Havěť, Střelci) z `podklady/Time to Delve.xlsx`. Rozpracované postavy a Vele-zvěř zatím převedené nejsou.

## Import z Excelu

Stránka `/generator/import`. Sešit se přečte v prohlížeči ([read-excel-file](https://gitlab.com/catamphetamine/read-excel-file)),
[src/lib/import/excel.ts](src/lib/import/excel.ts) v něm najde tabulky karet a na server jdou jen jejich řádky.
[src/lib/import/plan.ts](src/lib/import/plan.ts) je porovná s databází a ukáže náhled: nové karty, změny pole po poli,
řádky s chybou a karty, které jsou v sešitu podruhé. Až po potvrzení se vše zapíše v jedné transakci – a jen pokud
by import pořád udělal přesně to, co náhled ukázal. Když se karty mezitím změnily, neuloží se nic a ukáže se nový náhled.

- Tabulky se hledají na všech listech podle řádku se záhlavím (názvy sloupců jako v listech „HOTOVÉ POSTAVY“ a „NPC 2“,
  na pořadí, velikosti písmen a diakritice nezáleží). Tabulka končí prvním prázdným řádkem. Řádek s jedinou vyplněnou
  buňkou (poznámka, nadpis další tabulky) není karta.
- Classa je nadpis nad tabulkou (u NPC název skupiny vlevo od podskupin), jinak název listu. Chybějící classa se
  vytvoří i s životy a pasivkou z řádku „BARBAR | BPAS | …“; barvu jí pak nastav ručně.
- Karta se v rámci classy páruje podle kódu (u hrdinů ID Vrch), potom podle názvu. Přepíšou se jen pole, pro která má
  tabulka sloupec. Karty, které v sešitu nejsou, zůstanou – import nic nemaže. Výjimka a Zbytek sdílí jedno pole karty:
  vyplněná buňka ho přepíše, prázdná ho smaže jen tehdy, když karta drží právě ten druh.
- Tabulky, které mají záhlaví karet, ale chybí jim povinný sloupec (Vele-zvěř, banditi), import přeskočí a řekne proč.
  Listy, kde žádné záhlaví karet nenajde (třeba Rozdělané postavy – nemají sloupec s názvem karty), jen vypíše.

Import aktuálního `podklady/Time to Delve.xlsx` do databáze naplněné `npm run db:seed` nic nezmění – hlídá to test
v [tests/import.test.ts](tests/import.test.ts).

## Šablony karet

Podklady karet jsou v `public/templates`. Souřadnice textů v [src/components/card/CardFaces.tsx](src/components/card/CardFaces.tsx)
jsou v pixelech šablony, takže nová verze podkladu musí mít stejný rozměr.

| Soubor | Zdroj | Rozměr |
| --- | --- | --- |
| `player-front.jpg` | `podklady/TTD_karty/Karta Hráče Přední.jpg` (beze změny) | 864 × 1216 |
| `npc-front.jpg` | `podklady/TTD_karty/Karta NPC Přední.jpg` (beze změny) | 880 × 1196 |
| `npc-front-exception.jpg` | `podklady/Ornamentální kamenná karta s velkým panelem.png` (1076 × 1462), zmenšené a převedené do JPG | 880 × 1196 |
| `npc-back.jpg` | `podklady/TTD_karty/Karta NPC Zadní.jpg` (beze změny) | 864 × 1216 |

Líc NPC karty s výjimkou (`npc-front-exception.jpg`) má jeden velký panel místo dvou. Zmenšení třeba přes ImageMagick:

```bash
magick "podklady/Ornamentální kamenná karta s velkým panelem.png" -resize 880x1196! -quality 90 public/templates/npc-front-exception.jpg
```

## Licence ikon

Ikony pocházejí z [game-icons.net](https://game-icons.net) a jsou pod licencí
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Při publikaci hry je potřeba uvést autory
jednotlivých ikon (Lorc, Delapouite a další – viz stránka každé ikony).
