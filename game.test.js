import { describe, expect, it } from "vitest";
import {
  applyDecree,
  createGame,
  getOutcome,
  isSupplied,
  resolveCombat,
  resolveTurn,
} from "./game.js";

describe("三國一郡規則", () => {
  it("建立七城、三名將與三枚政令", () => {
    const game = createGame({ seed: 42, mode: "siege" });
    expect(game.cities).toHaveLength(7);
    expect(game.cities.filter((city) => city.owner === "player")).toHaveLength(3);
    expect(game.cities.filter((city) => city.owner === "enemy")).toHaveLength(3);
    expect(game.cities.filter((city) => city.owner === "neutral")).toHaveLength(1);
    expect(game.generals).toHaveLength(3);
    expect(game.actionsLeft).toBe(3);
  });

  it("每回合最多使用三枚政令", () => {
    let game = createGame({ seed: 1 });
    game = applyDecree(game, { type: "farm", cityId: "p-cap" });
    game = applyDecree(game, { type: "recruit", cityId: "p-cap" });
    game = applyDecree(game, { type: "fortify", cityId: "p-cap" });
    expect(game.actionsLeft).toBe(0);
    expect(() => applyDecree(game, { type: "farm", cityId: "p-cap" })).toThrow(/政令/);
  });

  it("移軍與出征只能前往相鄰城市", () => {
    const game = createGame({ seed: 2 });
    expect(() =>
      applyDecree(game, { type: "move", from: "p-cap", to: "pass", troops: 30 }),
    ).toThrow(/相鄰/);
    expect(() =>
      applyDecree(game, { type: "attack", from: "p-cap", to: "e-cap", troops: 30 }),
    ).toThrow(/相鄰/);
  });

  it("移軍依兵力消耗糧草", () => {
    const game = createGame({ seed: 3 });
    const before = game.resources.grain;
    const next = applyDecree(game, {
      type: "move",
      from: "p-west",
      to: "p-front",
      troops: 40,
    });
    expect(next.resources.grain).toBe(before - 4);
    expect(next.cities.find((city) => city.id === "p-west").troops).toBe(50);
    expect(next.cities.find((city) => city.id === "p-front").troops).toBe(110);
  });

  it("補給線必須沿己方城市連回都城", () => {
    const game = createGame({ seed: 4 });
    expect(isSupplied(game, "p-front", "player")).toBe(true);
    const cut = {
      ...game,
      cities: game.cities.map((city) =>
        city.id === "p-west" ? { ...city, owner: "enemy" } : city,
      ),
    };
    expect(isSupplied(cut, "p-front", "player")).toBe(false);
  });

  it("斷糧先降士氣，再造成逃兵", () => {
    const game = createGame({ seed: 5 });
    game.resources.grain = 0;
    game.cities = game.cities.map((city) =>
      city.id === "p-front" ? { ...city, morale: 22, troops: 100 } : city,
    );
    const next = resolveTurn(game, []);
    const front = next.cities.find((city) => city.id === "p-front");
    expect(front.morale).toBeLessThan(22);
    expect(front.troops).toBeLessThan(100);
    expect(next.lastReport.events.some((event) => event.includes("逃兵"))).toBe(true);
  });

  it("城牆會提高守軍戰力並可承受攻城", () => {
    const base = createGame({ seed: 19 });
    const attacker = { troops: 90, morale: 75, general: { might: 8, wit: 5 } };
    const weak = resolveCombat(attacker, { troops: 70, morale: 70, walls: 0 }, 99);
    const strong = resolveCombat(attacker, { troops: 70, morale: 70, walls: 3 }, 99);
    expect(strong.defensePower).toBeGreaterThan(weak.defensePower);
    expect(strong.attackerLoss).toBeGreaterThanOrEqual(weak.attackerLoss);
    expect(base.cities.find((city) => city.id === "e-front").walls).toBeGreaterThan(0);
  });

  it("雙方命令同時揭示，先移軍再結算交戰", () => {
    let game = createGame({ seed: 8 });
    game = applyDecree(game, {
      type: "move",
      from: "p-west",
      to: "p-front",
      troops: 20,
    });
    const next = resolveTurn(game, [
      { type: "attack", from: "e-front", to: "p-front", troops: 80 },
    ]);
    expect(next.lastReport.orders[0].type).toBe("move");
    expect(next.lastReport.battles[0].target).toBe("p-front");
    expect(next.lastReport.battles[0].defenderStartedWith).toBeGreaterThanOrEqual(90);
  });

  it("攻城劇本在十二回合內奪取敵都即勝", () => {
    const game = createGame({ seed: 10, mode: "siege" });
    game.cities = game.cities.map((city) =>
      city.id === "e-cap" ? { ...city, owner: "player" } : city,
    );
    expect(getOutcome(game)).toMatchObject({ status: "won", reason: "capital" });
  });

  it("守郡劇本守滿十二回合勝；失都優先判敗", () => {
    const game = createGame({ seed: 11, mode: "defend" });
    game.turn = 13;
    expect(getOutcome(game).status).toBe("won");
    game.cities = game.cities.map((city) =>
      city.id === "p-cap" ? { ...city, owner: "enemy" } : city,
    );
    expect(getOutcome(game)).toMatchObject({ status: "lost", reason: "capital" });
  });
});
