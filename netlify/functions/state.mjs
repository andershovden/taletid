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

function sanitizeState(input) {
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
  }
  return out;
}

export default async (req) => {
  const store = getStore("toastmaster");

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
    const clean = sanitizeState(body || {});
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
