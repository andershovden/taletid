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

function keyFor(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
}

export default async (req) => {
  const store = getStore("toastmaster");

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
    const existing = all[key] || { name, entries: {} };
    all[key] = {
      name,
      entries: { ...existing.entries, ...cleanEntries },
      updatedAt: new Date().toISOString()
    };
    await store.setJSON("guesses", all);
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders() });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
};

export const config = { path: "/api/guess" };
