(() => {
  const endpoint = "https://econ-paper-monitor-presence.academic-door.workers.dev/presence";
  const target = document.querySelector("[data-presence-count]");
  if (!target || !window.localStorage) return;

  const storageKey = "academic_door_nber_presence_client";
  let clientId = localStorage.getItem(storageKey);
  if (!clientId) {
    clientId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, clientId);
  }

  const heartbeat = async () => {
    try {
      const response = await fetch(`${endpoint}?site=nber&window=day&client_id=${encodeURIComponent(clientId)}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = response.ok ? await response.json() : null;
      if (data && Number.isFinite(Number(data.online))) {
        target.innerHTML = `<span class="presence-dot">●</span><span class="presence-count">${Number(data.online)} 人在线</span>`;
      }
    } catch (_) {
      // Presence is optional and must never affect article browsing.
    }
  };

  heartbeat();
  window.setInterval(heartbeat, 60_000);
})();
