# Taletid — gjettekonkurranse for bryllup 🎤💍

En liten nettapp til bryllup: konferansieren (toastmasteren) tar tiden på talene på en
storskjerm, mens bordene hos gjestene gjetter hvor lang tid hver taler bruker — via
mobilen, med QR-kode. Poeng og ledertavle regnes ut automatisk og vises likt for alle.

Appen er 100 % på norsk og bygget som en enkel statisk nettside med noen få
Netlify-funksjoner i bakkant — ingen database å sette opp, ingen bygg-steg.

## Slik henger det sammen

Det er tre sider som alle snakker med den samme lille "backend'en":

1. **`admin.html`** (åpnes på `/admin`) — dette er **storskjermen/kontrollpanelet**
   konferansieren styrer fra. Den viser:
   - en pauseskjerm mellom talene,
   - en live-scene med stor nedtellingsklokke, fargekoder (grønn → gult ved 5 min →
     rødt ved 7 min, med økende "kom-igjen-nå"-effekter jo lenger over tiden man går),
     og en liste over hva bordene har gjettet på taleren som pågår,
   - en resultatscene med ledertavle.

   Fra et redigeringsvindu i admin kan man legge inn talere, brudeparets egen gjetning
   per taler, og navn/dato på brudeparet. Når en taler markeres som "Ferdig ✓" sendes
   det faktiske resultatet til serveren, og gjettekonkurransen kan regne ut poeng for
   den taleren. Når konferansieren trykker "🏆 Avslutt konkurransen & kår vinner" på
   resultatscenen, kåres vinneren offisielt — dette er en bevisst, eksplisitt handling
   fremfor å bli utledet automatisk av at alle talere i listen er markert ferdig (en
   glemt eller ekstra taler i listen skal aldri kunne hindre at vinneren vises).

2. **`index.html`** (forsiden) — dette er **siden gjestene bruker på mobilen**. Hvert
   bord blir enige om ett tips per taler, skriver inn et bordnavn og sender inn
   gjetningene sine. Siden viser fortløpende hva alle bordene har gjettet, og når en
   taler er ferdig vises fasit, avvik og poeng — pluss en samlet ledertavle og et
   vinnerbanner (med konfetti 🎉) når alle talere er ferdige.

3. **`qr.html`** (åpnes på `/qr`) — en side som genererer utskriftsklare A4-ark med
   QR-kode til gjestesiden (`index.html`), til å legge på hvert bord. Man velger antall
   eksemplarer og skriver ut.

Alle tre sidene poller de samme API-ene et par ganger i minuttet, slik at storskjermen
og gjestenes telefoner alltid viser samme tall — ingen av frontend-sidene regner ut
poeng selv, det gjøres kun ett sted (se under).

## Hvordan kjøre det

Appen krever [Netlify CLI](https://docs.netlify.com/cli/get-started/), fordi den bruker
Netlify Functions og Netlify Blobs til lagring:

```bash
npm install
npx netlify dev
```

Dette starter en lokal server som serverer de statiske HTML-sidene *og* kjører
funksjonene i `netlify/functions/`. Åpne deretter:

- `http://localhost:8888/` — gjestesiden
- `http://localhost:8888/admin` — kontrollpanelet
- `http://localhost:8888/qr` — QR-arkene

For faktisk bruk deployes siden til Netlify (koblet til dette repoet). Kontrollpanelet
(`/admin`) krever ingen innlogging eller nøkkel — det er tenkt brukt av én person
(konferansieren) på én enhet under selve bryllupet, ikke som en flerbruker-tjeneste.
Lenken til `/admin` bør derfor ikke deles offentlig, siden alle som har den kan endre
talerlisten og resultatene.

## Filoversikt

| Fil / mappe | Hva den gjør |
|---|---|
| `index.html` | Gjestesiden — bordene sender inn gjetninger og ser resultater/ledertavle |
| `admin.html` | Storskjermen/kontrollpanelet konferansieren bruker til å ta tiden på talene og styre konkurransen |
| `qr.html` | Genererer utskriftsklare A4-ark med QR-kode til gjestesiden |
| `assets/app.js` | Delt JS-hjelpekode (tidsformatering, API-kall, poengformel, konfetti-animasjon) brukt av `index.html` og `qr.html` |
| `assets/theme.css` | Delt styling (farger, fonter, kort-design) for gjestesiden og QR-siden |
| `netlify/functions/state.mjs` | API (`/api/state`) for å hente/lagre talerliste, brudeparets navn/dato, hvilke talere som er ferdige, og om konkurransen er offisielt avsluttet |
| `netlify/functions/guess.mjs` | API (`/api/guess`) der bordene sender inn sine gjetninger per taler |
| `netlify/functions/leaderboard.mjs` | API (`/api/leaderboard`) — **den eneste kilden til sannhet** for poeng og rangering. Regner ut avvik, poeng og en garantert unik ledertavle (med flere nivåer tie-break), slik at storskjermen og gjestesiden aldri kan vise ulike tall |
| `netlify.toml` | Netlify-konfigurasjon: hvilken mappe som publiseres, hvor funksjonene ligger, og fine URL-er (`/admin`, `/qr`) |
| `package.json` | Avhengighet til `@netlify/blobs`, som funksjonene bruker til lagring |

## Hvordan poengsystemet fungerer

Når konferansieren markerer en taler som ferdig og legger inn faktisk taletid, regner
`leaderboard.mjs` ut for hvert bords gjetning:

- **Poeng per taler:** 50 poeng ved perfekt treff, ned mot 0 poeng ved ca. 5 minutters
  avvik, pluss 10 bonuspoeng til bordet/bordene som traff aller nærmest.
- **Sammenlagt ledertavle:** poengsum for alle talere lagt sammen, med flere
  tie-break-regler (lavest totalt avvik → flest "nærmest"-bonuser → hvem som sendte inn
  tips først → alfabetisk) slik at det aldri kan bli uavgjort om førsteplassen.
- **Brudeparet deltar også:** brudeparets egen gjetning (lagt inn av konferansieren per
  taler i `admin.html`) telles som et eget "bord" i konkurransen — med samme poeng,
  samme sjanse til nærmest-bonus, og en tydelig 💑-merking i gjettelister og ledertavle.

## Data og lagring

Ingen ekte database — alt lagres i [Netlify Blobs](https://docs.netlify.com/blobs/overview/)
under nøklene `state` (talerliste, brudepar, dato) og `guesses` (bordenes innsendte
gjetninger). "Nullstill alt" i admin-panelet sletter begge, og er ment for bruk under
testing før selve bryllupet.
