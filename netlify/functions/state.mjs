import { getStore } from "@netlify/blobs";

const DEFAULT_STATE = {
  coupleNames: "Karoline & Peter",
  weddingDate: "4.–5. september 2026",
  speakers: []
};

function corsHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-admin-key",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "cache-control": "no-store"
  };
}

function checkAdminKey(req) {
  const adminKey = req.headers.get("x-admin-key") || "";
  const expected = (typeof Netlify !== "undefined" && Netlify.env.get("ADMIN_KEY")) || "bryllup2026";
  return adminKey === expected;
}

function sanitizeState(input) {
  const out = {
    coupleNames: typeof input.coupleNames === "string" && input.coupleNames.trim()
      ? input.coupleNames.slice(0, 120)
      : DEFAULT_STATE.coupleNames,
    weddingDate: typeof input.weddingDate === "string" && input.weddingDate.trim()
      ? input.weddingDate.slice(0, 120)
      : DEFAULT_STATE.weddingDate,
    speakers: []
  };
  if (Array.isArray(input.speakers)) {
    out.speakers = input.speakers.slice(0, 60).map((sp, i) => ({
      id: typeof sp.id === "string" && sp.id ? sp.id.slice(0, 64) : ("sp-" + i + "-" + Math.random().toString(36).slice(2, 8)),
      name: typeof sp.name === "string" && sp.name.trim() ? sp.name.slice(0, 80) : "Uten navn",
      order: i,
      finished: !!sp.finished,
      actualSeconds: Number.isFinite(sp.actualSeconds) ? Math.max(0, Math.round(sp.actualSeconds)) : null
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
    if (!checkAdminKey(req)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders() });
    }
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
    if (!checkAdminKey(req)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders() });
    }
    // Nullstiller alt: talerliste, resultater og gjestenes gjetninger. Brukes for å rydde opp
    // etter testing før selve bryllupet.
    await store.setJSON("state", DEFAULT_STATE);
    await store.delete("guesses");
    return new Response(JSON.stringify({ ok: true, state: DEFAULT_STATE }), { headers: corsHeaders() });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
};

export const config = { path: "/api/state" };
