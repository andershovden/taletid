window.WeddingApp = (function () {
  function fmt(totalSec) {
    const s = Math.max(0, Math.round(totalSec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  async function apiGet(path) {
    const res = await fetch(path, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("GET " + path + " failed: " + res.status);
    return res.json();
  }

  async function apiPost(path, body, adminKey) {
    const headers = { "content-type": "application/json" };
    if (adminKey) headers["x-admin-key"] = adminKey;
    const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "POST " + path + " failed: " + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Poeng for hvor nær en gjetning var det faktiske resultatet.
  // 50 poeng ved perfekt treff, ned mot 0 ved ca. 5 minutter (300 sek) avvik.
  function points(diffSec) {
    return Math.max(0, Math.round(50 - diffSec / 6));
  }

  function launchConfetti(containerEl, count) {
    if (!containerEl) return;
    containerEl.innerHTML = "";
    const colors = ["#b8935a", "#c98e86", "#8a9a7e", "#c99a4b", "#f2e9dc", "#d9bd8c"];
    const n = count || 90;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      p.className = "confetti-piece";
      const size = 6 + Math.random() * 8;
      const isRound = Math.random() < 0.5;
      p.style.width = size + "px";
      p.style.height = (isRound ? size : size * 1.5) + "px";
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.borderRadius = isRound ? "50%" : "2px";
      p.style.left = Math.random() * 100 + "%";
      const duration = 2.6 + Math.random() * 1.8;
      const delay = Math.random() * 0.6;
      p.style.animationDuration = duration + "s";
      p.style.animationDelay = delay + "s";
      containerEl.appendChild(p);
      setTimeout(() => p.remove(), (duration + delay) * 1000 + 200);
    }
  }

  return { fmt, apiGet, apiPost, points, launchConfetti };
})();
