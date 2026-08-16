const URLS = Object.freeze({
  best: "/api/kv/junzheng:best",
  unlocks: "/api/kv/junzheng:unlocks",
  settings: "/api/kv/junzheng:settings",
});

async function loadText(url, fallback, fetcher) {
  try {
    const response = await fetcher(url);
    return response.ok ? await response.text() : fallback;
  } catch {
    return fallback;
  }
}

export async function loadBest(fetcher = fetch) {
  const value = Number(await loadText(URLS.best, "0", fetcher));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export async function saveBest(score, currentBest = 0, fetcher = fetch) {
  const next = Math.max(0, Math.round(score), currentBest);
  if (next <= currentBest) return currentBest;
  try {
    await fetcher(URLS.best, { method: "PUT", body: String(next) });
  } catch {
    // Static previews remain fully playable when the host KV API is absent.
  }
  return next;
}

export async function loadUnlocks(fetcher = fetch) {
  try {
    const parsed = JSON.parse(await loadText(URLS.unlocks, "[]", fetcher));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveUnlocks(unlocks, fetcher = fetch) {
  const safe = [...new Set(unlocks.filter((value) => typeof value === "string"))];
  try {
    await fetcher(URLS.unlocks, { method: "PUT", body: JSON.stringify(safe) });
  } catch {
    // Non-authoritative memory state is enough for the current session.
  }
  return safe;
}

export async function loadSettings(fetcher = fetch) {
  try {
    const parsed = JSON.parse(await loadText(URLS.settings, "{}", fetcher));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveSettings(settings, fetcher = fetch) {
  const safe = {
    muted: Boolean(settings.muted),
    difficulty: settings.difficulty === "hard" ? "hard" : "normal",
  };
  try {
    await fetcher(URLS.settings, { method: "PUT", body: JSON.stringify(safe) });
  } catch {
    // Settings stay in memory if KV is unavailable.
  }
  return safe;
}
