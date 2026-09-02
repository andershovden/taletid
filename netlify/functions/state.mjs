import { getStore } from "@netlify/blobs";

const DEFAULT_STATE = {
  coupleNames: "Karoline & Peter",
  weddingDate: "4.–5. september 2026",
  speakers: [],
  competitionFinished: false
};

function corsHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "cache-control": "no-store"
  };
}

function sanitizeState(input, prev) {
  const out = {
    coupleNames: typeof input.coupleNames === "string" && input.coupleNames.trim()
      ? input.coupleNames.slice(0, 120)
      : DEFAULT_STATE.coupleNames,
    weddingDate: typeof input.weddingDate === "string" && input.weddingDate.trim()
      ? input.weddingDate.slice(0, 120)
      : DEFAULT_STATE.weddingDate,
    speakers: [],
    // Eksplisitt satt av konferansieren via "Avslutt konkurransen"-knappen i
    // admin.html — IKKE utledet fra om alle talere i listen er markert ferdig.
    // En glemt/ekstra taler i listen skal aldri kunne hindre at vinneren kåres.
    competitionFinished: !!input.competitionFinished
  };
  if (Array.isArray(input.speakers)) {
    out.speakers = input.speakers.slice(0, 60).map((sp, i) => ({
      id: typeof sp.id === "string" && sp.id ? sp.id.slice(0, 64) : ("sp-" + i + "-" + Math.random().toString(36).slice(2, 8)),
      name: typeof sp.name === "string" && sp.name.trim() ? sp.name.slice(0, 80) : "Uten navn",
      order: i,
      finished: !!sp.finished,
      actualSeconds: Number.isFinite(sp.actualSeconds) ? Math.max(0, Math.round(sp.actualSeconds)) : null,
      coupleGuessSeconds: Number.isFinite(sp.coupleGuessSeconds) ? Math.max(0, Math.round(sp.coupleGuessSeconds)) : null
    }));
  } else if (prev && Array.isArray(prev.speakers)) {
    // Ingen "speakers"-liste sendt med i det hele tatt (i motsetning til en tom
    // liste, som er et gyldig, eksplisitt "slett alle talere") — behold det som
    // allerede er lagret i stedet for å tolke fravær som "slett alt". En klient
    // med en feil i payloaden skal aldri kunne viske ut hele talerlisten og
    // resultatene ved et uhell.
    out.speakers = prev.speakers;
  }
  return out;
}

export default async (req) => {
  // "strong" konsistens tvinger lesing/skriving til å hoppe over Netlify sin
  // globale edge-cache og gå rett til kilden. Uten dette er lagringen KUN
  // "eventually consistent" (standardverdi i @netlify/blobs), som betyr at en
  // lesing rett etter en skriving kan få en utdatert kopi tilbake i et kort
  // øyeblikk — det var akkurat dette som gjorde at resultatscenen i admin.html
  // kunne vise "0 av N ferdig, ingen resultater" rett etter at en taler ble
  // markert ferdig, selv om lagringen i seg selv hadde skjedd riktig.
  const store = getStore({ name: "toastmaster", consistency: "strong" });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method === "GET") {
    const state = (await store.get("state", { type: "json" })) || DEFAULT_STATE;
    return new Response(JSON.stringify(state), { headers: corsHeaders() });
  }

  if (req.method === "POST") {
    // Ingen admin-nøkkel kreves — dette er ett kontrollpanel på én enhet som
    // toastmasteren bruker under selve bryllupet, ikke en flerbruker-tjeneste.
    // En feil/manglende nøkkel forårsaket tidligere stille 401-feil der
    // ingenting ble publisert til gjestene uten at noen fikk vite hvorfor.
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: corsHeaders() });
    }
    const prev = (await store.get("state", { type: "json" })) || DEFAULT_STATE;
    const clean = sanitizeState(body || {}, prev);
    await store.setJSON("state", clean);
    return new Response(JSON.stringify({ ok: true, state: clean }), { headers: corsHeaders() });
  }

  if (req.method === "DELETE") {
    // Nullstiller alt: talerliste, resultater og gjestenes gjetninger. Brukes for å rydde opp
    // etter testing før selve bryllupet. Admin.html ber om dobbel bekreftelse først.
    await store.setJSON("state", DEFAULT_STATE);
    await store.delete("guesses");
    return new Response(JSON.stringify({ ok: true, state: DEFAULT_STATE }), { headers: corsHeaders() });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
};

export const config = { path: "/api/state" };
