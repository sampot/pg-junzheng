import { describe, expect, it, vi } from "vitest";
import {
  loadBest,
  loadSettings,
  loadUnlocks,
  saveBest,
  saveSettings,
} from "./persist.js";

describe("KV persistence", () => {
  it("loads the best campaign score", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, text: async () => "842" });
    await expect(loadBest(fetcher)).resolves.toBe(842);
    expect(fetcher).toHaveBeenCalledWith("/api/kv/junzheng:best");
  });

  it("falls back safely on missing or malformed values", async () => {
    await expect(loadBest(vi.fn().mockRejectedValue(new Error("offline")))).resolves.toBe(0);
    await expect(
      loadUnlocks(vi.fn().mockResolvedValue({ ok: true, text: async () => "{broken" })),
    ).resolves.toEqual([]);
  });

  it("only writes a new personal best", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    await expect(saveBest(700, 800, fetcher)).resolves.toBe(800);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(saveBest(900, 800, fetcher)).resolves.toBe(900);
    expect(fetcher).toHaveBeenCalledWith("/api/kv/junzheng:best", {
      method: "PUT",
      body: "900",
    });
  });

  it("round-trips settings through the settings key", async () => {
    const settings = { muted: true, difficulty: "hard" };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(settings) });
    await saveSettings(settings, fetcher);
    await expect(loadSettings(fetcher)).resolves.toEqual(settings);
    expect(fetcher.mock.calls[0][0]).toBe("/api/kv/junzheng:settings");
  });
});
