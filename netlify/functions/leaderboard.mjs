import { getStore } from "@netlify/blobs";

function corsHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "cache-control": "no-store"
  };
}

// Poeng for hvor nær en gjetning var det faktiske resultatet: 50 poeng ved perfekt
// treff, ned mot 0 poeng ved ca. 5 minutters (300 sek) avvik. Pluss en bonus på 10
// poeng til den/de som traff aller nærmest på den enkelte taleren.
function pointsFor(diffSec) {
  return Math.max(0, Math.round(50 - diffSec / 6));
}

// Brudeparet deltar i konkurransen på lik linje med de andre deltakerne, med denne
// faste nøkkelen/navnet. Reservert slik at ingen andre kan late som om det er brudeparet.
const COUPLE_KEY = "__brudeparet__";
const COUPLE_NAME = "💑 Brudeparet";

// Denne funksjonen er den ENE kilden til sannhet for poengsum og rangering, slik at
// gjettesiden og storskjermen aldri kan vise ulike resultater. Brudeparets egen
// gjetning (state.speakers[].coupleGuessSeconds) telles som en egen deltaker i
// konkurransen (se COUPLE_KEY under), på lik linje med gjestenes påmeldinger.
// Rangeringen er alltid strengt sortert — det kan aldri bli uavgjort om
// førsteplassen, fordi vi legger på flere tie-breakere etter hverandre helt til
// rekkefølgen er unik:
//   1. Flest poeng totalt
//   2. Lavest samlet avvik i sekunder (mest presise over hele kvelden)
//   3. Flest ganger nærmest på en enkelt taler ("🎯 nærmest"-bonuser)
//   4. Den som var først ute med å sende inn en gjetning
//   5. Alfabetisk på navn (garanterer en unik rekkefølge uansett)
export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
  }

  // "strong" konsistens: se forklaring i state.mjs. Dette er den mest kritiske
  // av de tre funksjonene å rette, siden det er DENNE som leser talerlisten og
  // gjetningene rett etter at admin.html nettopp har lagret et resultat.
  const store = getStore({ name: "toastmaster", consistency: "strong" });
  const state = (await store.get("state", { type: "json" })) || { coupleNames: "", weddingDate: "", speakers: [] };
  const guesses = (await store.get("guesses", { type: "json" })) || {};

  const speakers = (state.speakers || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  // totals[key] = { name, points, totalDiff, bonusCount, createdAt }
  const totals = {};
  function totalFor(key, name, createdAt, isCouple) {
    if (!totals[key]) {
      totals[key] = { key, name, points: 0, totalDiff: 0, bonusCount: 0, createdAt: createdAt || null, isCouple: !!isCouple };
    }
    return totals[key];
  }

  const speakerResults = speakers.map((sp) => {
    const rawGuesses = [];
    for (const key of Object.keys(guesses)) {
      const rec = guesses[key] || {};
      const g = rec.entries ? rec.entries[sp.id] : undefined;
      if (g == null) continue;
      rawGuesses.push({ key, name: rec.name, guess: g, createdAt: rec.createdAt || rec.updatedAt || null, isCouple: false });
    }
    // Brudeparets gjetning telles som en egen deltaker i konkurransen, slik at den er
    // med i poengsummen og på ledertavlen akkurat som gjestenes gjetninger.
    if (sp.coupleGuessSeconds != null) {
      rawGuesses.push({ key: COUPLE_KEY, name: COUPLE_NAME, guess: sp.coupleGuessSeconds, createdAt: null, isCouple: true });
    }

    if (!sp.finished || sp.actualSeconds == null) {
      return {
        id: sp.id,
        name: sp.name,
        finished: false,
        actualSeconds: null,
        coupleGuessSeconds: sp.coupleGuessSeconds != null ? sp.coupleGuessSeconds : null,
        // Brudeparet vises alltid øverst i listen (uansett gjetning), deretter
        // de andre sortert på gjetning.
        guesses: rawGuesses
          .slice()
          .sort((a, b) => (a.isCouple !== b.isCouple ? (a.isCouple ? -1 : 1) : a.guess - b.guess))
          .map((g) => ({ name: g.name, guess: g.guess, isCouple: g.isCouple }))
      };
    }

    const scored = rawGuesses.map((g) => {
      const diff = Math.abs(g.guess - sp.actualSeconds);
      return { ...g, diff, points: pointsFor(diff) };
    });
    const minDiff = scored.length ? Math.min(...scored.map((g) => g.diff)) : null;

    scored.forEach((g) => {
      const closest = g.diff === minDiff;
      const t = totalFor(g.key, g.name, g.createdAt, g.isCouple);
      t.points += g.points + (closest ? 10 : 0);
      t.totalDiff += g.diff;
      if (closest) t.bonusCount += 1;
      if (g.createdAt && (!t.createdAt || g.createdAt < t.createdAt)) t.createdAt = g.createdAt;
    });

    return {
      id: sp.id,
      name: sp.name,
      finished: true,
      actualSeconds: sp.actualSeconds,
      coupleGuessSeconds: sp.coupleGuessSeconds != null ? sp.coupleGuessSeconds : null,
      // Brudeparet vises alltid øverst i listen (uansett avvik), deretter
      // de andre sortert fra nærmest til lengst unna.
      guesses: scored
        .slice()
        .sort((a, b) => (a.isCouple !== b.isCouple ? (a.isCouple ? -1 : 1) : a.diff - b.diff))
        .map((g) => ({
          name: g.name,
          guess: g.guess,
          diff: g.diff,
          closest: g.diff === minDiff,
          points: g.points + (g.diff === minDiff ? 10 : 0),
          isCouple: g.isCouple
        }))
    };
  });

  // "Ferdig kåret" styres EKSPLISITT av konferansieren (state.competitionFinished,
  // satt via "Avslutt konkurransen"-knappen i admin.html) — utledes bevisst IKKE
  // fra om alle rader i talerlisten er markert ferdig. Det gjorde vinner-kåringen
  // skjør: en glemt eller ekstra taler i listen (f.eks. fra tidligere testing)
  // kunne hindre at vinneren noensinne ble vist, selv om konkurransen reelt var over.
  const allDone = !!state.competitionFinished;
  const finishedCount = speakers.filter((s) => s.finished).length;

  const leaderboard = Object.values(totals)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (a.totalDiff !== b.totalDiff) return a.totalDiff - b.totalDiff;
      if (b.bonusCount !== a.bonusCount) return b.bonusCount - a.bonusCount;
      const at = a.createdAt || "";
      const bt = b.createdAt || "";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.name.localeCompare(b.name, "no");
    })
    .map(({ key, ...rest }) => rest);

  const body = {
    coupleNames: state.coupleNames || "",
    weddingDate: state.weddingDate || "",
    allDone,
    // Hjelpefelt for admin.html, slik at konferansieren kan se "X av Y talere
    // ferdig" som en veiledning for når det er naturlig å avslutte konkurransen —
    // uten at dette tallet i seg selv styrer vinner-kåringen (se allDone over).
    finishedCount,
    totalCount: speakers.length,
    speakers: speakerResults,
    leaderboard
  };

  return new Response(JSON.stringify(body), { headers: corsHeaders() });
};

export const config = { path: "/api/leaderboard" };
