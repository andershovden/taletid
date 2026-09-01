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
// poeng til bordet/bordene som traff aller nærmest på den enkelte taleren.
function pointsFor(diffSec) {
  return Math.max(0, Math.round(50 - diffSec / 6));
}

// Denne funksjonen er den ENE kilden til sannhet for poengsum og rangering, slik at
// gjettesiden og storskjermen aldri kan vise ulike resultater. Rangeringen er alltid
// strengt sortert — det kan aldri bli uavgjort om førsteplassen, fordi vi legger på
// flere tie-breakere etter hverandre helt til rekkefølgen er unik:
//   1. Flest poeng totalt
//   2. Lavest samlet avvik i sekunder (mest presise bord over hele kvelden)
//   3. Flest ganger nærmest på en enkelt taler ("🎯 nærmest"-bonuser)
//   4. Bordet som var først ute med å sende inn en gjetning
//   5. Alfabetisk på bordnavn (garanterer en unik rekkefølge uansett)
export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
  }

  const store = getStore("toastmaster");
  const state = (await store.get("state", { type: "json" })) || { coupleNames: "", weddingDate: "", speakers: [] };
  const guesses = (await store.get("guesses", { type: "json" })) || {};

  const speakers = (state.speakers || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  // totals[key] = { name, points, totalDiff, bonusCount, createdAt }
  const totals = {};
  function totalFor(key, name, createdAt) {
    if (!totals[key]) {
      totals[key] = { key, name, points: 0, totalDiff: 0, bonusCount: 0, createdAt: createdAt || null };
    }
    return totals[key];
  }

  const speakerResults = speakers.map((sp) => {
    const rawGuesses = [];
    for (const key of Object.keys(guesses)) {
      const rec = guesses[key] || {};
      const g = rec.entries ? rec.entries[sp.id] : undefined;
      if (g == null) continue;
      rawGuesses.push({ key, name: rec.name, guess: g, createdAt: rec.createdAt || rec.updatedAt || null });
    }

    if (!sp.finished || sp.actualSeconds == null) {
      return {
        id: sp.id,
        name: sp.name,
        finished: false,
        actualSeconds: null,
        coupleGuessSeconds: sp.coupleGuessSeconds != null ? sp.coupleGuessSeconds : null,
        guesses: rawGuesses
          .slice()
          .sort((a, b) => a.guess - b.guess)
          .map((g) => ({ name: g.name, guess: g.guess }))
      };
    }

    const scored = rawGuesses.map((g) => {
      const diff = Math.abs(g.guess - sp.actualSeconds);
      return { ...g, diff, points: pointsFor(diff) };
    });
    const minDiff = scored.length ? Math.min(...scored.map((g) => g.diff)) : null;

    scored.forEach((g) => {
      const closest = g.diff === minDiff;
      const t = totalFor(g.key, g.name, g.createdAt);
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
      guesses: scored
        .slice()
        .sort((a, b) => a.diff - b.diff)
        .map((g) => ({
          name: g.name,
          guess: g.guess,
          diff: g.diff,
          closest: g.diff === minDiff,
          points: g.points + (g.diff === minDiff ? 10 : 0)
        }))
    };
  });

  const allDone = speakers.length > 0 && speakers.every((s) => s.finished);

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
    speakers: speakerResults,
    leaderboard
  };

  return new Response(JSON.stringify(body), { headers: corsHeaders() });
};

export const config = { path: "/api/leaderboard" };
