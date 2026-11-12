# Time to Delve

Web hry Time to Delve: veřejná úvodní stránka a týmový generátor karet (za přihlášením).

- **Karty hrdinů** (líc) a **NPC karty** (líc + rub s predikcí) se vykreslují do šablon v `public/templates`
  (viz [Šablony karet](#šablony-karet)).
- **Classy a NPC skupiny** mají vlastní barvu, která tónuje rámeček karty. Karta bez classy je obecná.
- **Ikonografie:** klíčové slovo psané VELKÝMI písmeny (`ÚTOK 3`, `DOSAH 2`, `KRVÁCENÍ`…) se vykreslí ikonou
  z `podklady/TTD_Ikony`. Mapování a pravidla jsou v [src/lib/keywords.ts](src/lib/keywords.ts).
- Export karty do PNG v rozlišení šablony (864 × 1216 px).
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

## Data z podkladů

`src/lib/db/seed-data.json` je převod listů „HOTOVÉ POSTAVY“ (Barbar, Střelec, Šermíř) a „NPC 2“ (Nemrtví,
Havěť, Střelci) z `podklady/Time to Delve.xlsx`. Rozpracované postavy a Vele-zvěř zatím převedené nejsou.

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
