import { getStore } from "@netlify/blobs";

function corsHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "cache-control": "no-store"
  };
}

// Reservert for brudeparets egen gjetning i /api/leaderboard — ingen andre skal
// kunne late som om det er brudeparet ved å navngi seg noe som ligner. Sjekket mot
// bokstaver/tall i navnet (uten mellomrom/emoji/tegn), slik at «Brudeparet», «💑
// Brudeparet» og lignende varianter alle fanges opp, ikke bare den interne nøkkelen.
function looksLikeCouple(rawName) {
  const stripped = rawName.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return stripped === "brudeparet";
}

function keyFor(name) {
  const key = name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
  return looksLikeCouple(name) ? key + "-bord" : key;
}

export default async (req) => {
  // "strong" konsistens: se forklaring i state.mjs. Uten dette kunne en gjetning
  // sendt inn rett før en taler ble markert ferdig i sjeldne tilfeller ikke bli
  // sett av den påfølgende poengberegningen i leaderboard.mjs.
  const store = getStore({ name: "toastmaster", consistency: "strong" });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method === "GET") {
    // Gjetninger er åpne for alle med en gang de sendes inn (per taler),
    // slik at gjestene kan se hva andre har tippet mens de venter. Fasit/poeng
    // vises først når admin markerer taleren som ferdig (styres i index.html).
    const all = (await store.get("guesses", { type: "json" })) || {};
    return new Response(JSON.stringify({ guesses: all }), { headers: corsHeaders() });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: corsHeaders() });
    }
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) {
      return new Response(JSON.stringify({ error: "navn mangler" }), { status: 400, headers: corsHeaders() });
    }

    const state = (await store.get("state", { type: "json" })) || { speakers: [] };
    const validIds = new Set((state.speakers || []).filter((s) => !s.finished).map((s) => s.id));

    const incoming = body && typeof body.entries === "object" && body.entries ? body.entries : {};
    const cleanEntries = {};
    for (const spId of Object.keys(incoming)) {
      if (!validIds.has(spId)) continue;
      const v = Number(incoming[spId]);
      if (Number.isFinite(v) && v >= 0 && v <= 3600) {
        cleanEntries[spId] = Math.round(v);
      }
    }

    const all = (await store.get("guesses", { type: "json" })) || {};
    const key = keyFor(name);
    // Hvis noen navngir seg selv noe som ligner brudeparet, gi dem et synlig
    // annet visningsnavn — ellers ville det se ut som brudeparet dukker opp to
    // ganger i gjettelisten (én gang som den påmeldte, én gang som den ekte 💑-raden).
    const displayName = looksLikeCouple(name) ? name + " (gjest)" : name;
    const now = new Date().toISOString();
    const existing = all[key] || { name: displayName, entries: {}, createdAt: now };
    all[key] = {
      name: displayName,
      entries: { ...existing.entries, ...cleanEntries },
      // createdAt = tidspunktet den påmeldte FØRST sendte inn en gjetning. Brukes som en av
      // flere tie-breakere i /api/leaderboard, og skal aldri endres ved senere redigering.
      createdAt: existing.createdAt || now,
      updatedAt: now
    };
    await store.setJSON("guesses", all);
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders() });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
};

export const config = { path: "/api/guess" };
