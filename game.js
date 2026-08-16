export const DECREE_NAMES = Object.freeze({
  farm: "屯田",
  recruit: "徵兵",
  fortify: "築城",
  move: "移軍",
  attack: "出征",
  scout: "偵察",
});

export const EDGES = Object.freeze([
  ["p-cap", "p-west"],
  ["p-west", "p-front"],
  ["p-front", "pass"],
  ["p-front", "e-front"],
  ["pass", "e-front"],
  ["e-front", "e-east"],
  ["e-east", "e-cap"],
  ["p-west", "pass"],
  ["pass", "e-east"],
]);

const GENERAL_TEMPLATES = Object.freeze([
  { id: "guan", name: "關平", might: 8, wit: 5, trait: "先鋒", cityId: "p-front" },
  { id: "zhuge", name: "諸葛瑾", might: 4, wit: 9, trait: "智囊", cityId: "p-cap" },
  { id: "huang", name: "黃權", might: 6, wit: 7, trait: "屯田", cityId: "p-west" },
]);

const CITY_TEMPLATES = Object.freeze([
  { id: "p-cap", name: "漢中", owner: "player", troops: 120, walls: 3, morale: 78, x: 13, y: 70, capital: true },
  { id: "p-west", name: "陽平", owner: "player", troops: 90, walls: 2, morale: 74, x: 29, y: 42 },
  { id: "p-front", name: "定軍", owner: "player", troops: 70, walls: 2, morale: 72, x: 42, y: 75 },
  { id: "pass", name: "葭萌關", owner: "neutral", troops: 45, walls: 2, morale: 58, x: 51, y: 27 },
  { id: "e-front", name: "劍閣", owner: "enemy", troops: 80, walls: 3, morale: 73, x: 63, y: 68 },
  { id: "e-east", name: "梓潼", owner: "enemy", troops: 90, walls: 2, morale: 76, x: 75, y: 34 },
  { id: "e-cap", name: "成都", owner: "enemy", troops: 130, walls: 4, morale: 80, x: 89, y: 64, capital: true },
]);

function mix(seed, value) {
  let n = (Number(seed) ^ Math.imul(value + 1, 0x9e3779b1)) >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x21f0aaad);
  n ^= n >>> 15;
  n = Math.imul(n, 0x735a2d97);
  return (n ^ (n >>> 15)) >>> 0;
}

function random01(seed, value = 0) {
  return mix(seed, value) / 0x100000000;
}

function cloneGame(game) {
  return {
    ...game,
    resources: { ...game.resources },
    enemyResources: { ...game.enemyResources },
    cities: game.cities.map((city) => ({ ...city })),
    generals: game.generals.map((general) => ({ ...general })),
    orders: game.orders.map((order) => ({ ...order })),
    history: [...game.history],
    intel: { ...game.intel },
  };
}

export function createGame({ seed = Date.now(), mode = "siege", difficulty = "normal" } = {}) {
  if (!["siege", "defend"].includes(mode)) throw new Error("未知劇本");
  if (!["normal", "hard"].includes(difficulty)) throw new Error("未知難度");
  return {
    seed: Number(seed) >>> 0,
    rng: mix(seed, 77),
    mode,
    difficulty,
    turn: 1,
    maxTurns: 12,
    phase: "planning",
    actionsLeft: 3,
    resources: { grain: 72, soldiers: 280, support: 72 },
    enemyResources: { grain: difficulty === "hard" ? 78 : 66, support: 68 },
    cities: CITY_TEMPLATES.map((city) => ({ ...city })),
    generals: GENERAL_TEMPLATES.map((general) => ({ ...general })),
    orders: [],
    intel: {},
    lastReport: null,
    history: [],
  };
}

export function isAdjacent(from, to) {
  return EDGES.some(([a, b]) => (a === from && b === to) || (a === to && b === from));
}

function getCity(game, id) {
  const city = game.cities.find((item) => item.id === id);
  if (!city) throw new Error("找不到城市");
  return city;
}

function neighborsOf(id) {
  return EDGES.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []));
}

export function isSupplied(game, cityId, owner) {
  const city = getCity(game, cityId);
  if (city.owner !== owner) return false;
  const capitalId = owner === "player" ? "p-cap" : "e-cap";
  const queue = [cityId];
  const visited = new Set(queue);
  while (queue.length) {
    const current = queue.shift();
    if (current === capitalId) return true;
    for (const nextId of neighborsOf(current)) {
      if (!visited.has(nextId) && getCity(game, nextId).owner === owner) {
        visited.add(nextId);
        queue.push(nextId);
      }
    }
  }
  return false;
}

function troopTotal(game, owner) {
  return game.cities
    .filter((city) => city.owner === owner)
    .reduce((sum, city) => sum + city.troops, 0);
}

function validateTroops(city, troops) {
  if (!Number.isInteger(troops) || troops < 10) throw new Error("至少調動 10 兵");
  if (troops > city.troops - 10) throw new Error("城內至少須留 10 兵");
}

function generalAt(game, cityId, owner = "player") {
  if (owner === "enemy") {
    return { name: "敵將", might: game.difficulty === "hard" ? 8 : 7, wit: 6, trait: "守備" };
  }
  return game.generals.find((general) => general.cityId === cityId) ?? {
    name: "偏將",
    might: 5,
    wit: 5,
    trait: "無",
  };
}

export function applyDecree(game, action) {
  if (game.phase !== "planning") throw new Error("本局已結束");
  if (game.actionsLeft <= 0) throw new Error("本回合政令已用盡");
  if (!DECREE_NAMES[action.type]) throw new Error("未知政令");
  const next = cloneGame(game);
  const city = action.cityId ? getCity(next, action.cityId) : getCity(next, action.from);
  if (city.owner !== "player") throw new Error("只能向我方城市下令");

  if (action.type === "farm") {
    const general = generalAt(next, city.id);
    const gain = 14 + Math.floor(general.wit / 2) + (general.trait === "屯田" ? 5 : 0);
    next.resources.grain += gain;
    next.resources.support = Math.min(100, next.resources.support + 2);
    action = { ...action, gain };
  } else if (action.type === "recruit") {
    if (next.resources.grain < 8) throw new Error("徵兵需要 8 糧");
    if (next.resources.support < 8) throw new Error("民心不足，無法徵兵");
    next.resources.grain -= 8;
    next.resources.support -= 4;
    city.troops += 24;
  } else if (action.type === "fortify") {
    if (next.resources.grain < 6) throw new Error("築城需要 6 糧");
    if (city.walls >= 5) throw new Error("城防已達上限");
    next.resources.grain -= 6;
    city.walls += 1;
    city.morale = Math.min(100, city.morale + 3);
  } else if (action.type === "move") {
    const target = getCity(next, action.to);
    if (!isAdjacent(city.id, target.id)) throw new Error("只能移軍至相鄰城市");
    if (target.owner !== "player") throw new Error("移軍只能前往我方城市");
    validateTroops(city, action.troops);
    const cost = Math.ceil(action.troops / 10);
    if (next.resources.grain < cost) throw new Error("糧草不足，無法移軍");
    next.resources.grain -= cost;
    city.troops -= action.troops;
    target.troops += action.troops;
    const general = next.generals.find((item) => item.cityId === city.id);
    if (general && action.moveGeneral) general.cityId = target.id;
    action = { ...action, cost, resolved: true };
  } else if (action.type === "attack") {
    const target = getCity(next, action.to);
    if (!isAdjacent(city.id, target.id)) throw new Error("只能出征相鄰城市");
    if (target.owner === "player") throw new Error("我方城市請使用移軍");
    validateTroops(city, action.troops);
    const cost = Math.ceil(action.troops / 8);
    if (next.resources.grain < cost) throw new Error("出征糧草不足");
    next.resources.grain -= cost;
    action = { ...action, cost };
  } else if (action.type === "scout") {
    const target = getCity(next, action.to);
    if (!isAdjacent(city.id, target.id)) throw new Error("只能偵察鄰城");
    if (target.owner === "player") throw new Error("此城已在掌握中");
    const general = generalAt(next, city.id);
    next.intel[target.id] = {
      troops: target.troops,
      walls: target.walls,
      exact: general.wit >= 7,
      turn: next.turn,
    };
  }

  next.orders.push({ ...action, side: "player" });
  next.actionsLeft -= 1;
  next.resources.soldiers = troopTotal(next, "player");
  return next;
}

export function resolveCombat(attacker, defender, seed = 1) {
  const attackGeneral = attacker.general ?? { might: 5, wit: 5, trait: "" };
  const defenseGeneral = defender.general ?? { might: 5, wit: 5, trait: "" };
  const swing = 0.94 + random01(seed, attacker.troops + defender.troops) * 0.12;
  const attackPower =
    attacker.troops *
    (0.58 + attacker.morale / 180) *
    (1 + attackGeneral.might * 0.025) *
    swing;
  const defensePower =
    defender.troops *
    (0.62 + defender.morale / 170) *
    (1 + defenseGeneral.wit * 0.018) +
    defender.walls * 24;
  const attackerWon = attackPower > defensePower;
  const attackerLoss = Math.min(
    attacker.troops,
    Math.max(8, Math.round(defender.troops * (attackerWon ? 0.48 : 0.7) + defender.walls * 3)),
  );
  const defenderLoss = Math.min(
    defender.troops,
    Math.max(7, Math.round(attacker.troops * (attackerWon ? 0.67 : 0.38))),
  );
  return { attackerWon, attackPower, defensePower, attackerLoss, defenderLoss, swing };
}

function executeAttack(game, order, side, report, index) {
  const from = getCity(game, order.from);
  const target = getCity(game, order.to);
  if (from.owner !== side || target.owner === side || !isAdjacent(from.id, target.id)) return;
  const troops = Math.min(order.troops, Math.max(0, from.troops - 10));
  if (troops < 10) return;
  const attackerGeneral = generalAt(game, from.id, side);
  const defenderGeneral = generalAt(game, target.id, target.owner);
  const defenderStartedWith = target.troops;
  const result = resolveCombat(
    { troops, morale: from.morale, general: attackerGeneral },
    { troops: target.troops, morale: target.morale, walls: target.walls, general: defenderGeneral },
    mix(game.rng, index + game.turn * 13),
  );
  from.troops -= troops;
  target.troops = Math.max(0, target.troops - result.defenderLoss);
  const survivors = Math.max(1, troops - result.attackerLoss);
  if (result.attackerWon && (target.troops === 0 || survivors > target.troops * 0.75)) {
    const oldOwner = target.owner;
    target.owner = side;
    target.troops = survivors;
    target.morale = Math.max(42, from.morale - 8);
    target.walls = Math.max(0, target.walls - 1);
    const general = game.generals.find((item) => item.cityId === from.id);
    if (side === "player" && general) general.cityId = target.id;
    report.events.push(`${side === "player" ? "我軍" : "敵軍"}攻取${target.name}！`);
    if (oldOwner === "neutral") report.events.push(`${target.name}守軍開關歸附。`);
  } else {
    from.troops += survivors;
    from.morale = Math.max(20, from.morale - 8);
    target.morale = Math.max(25, target.morale - 4);
    if (target.walls > 0 && result.defenderLoss > target.troops * 0.4) target.walls -= 1;
    report.events.push(`${target.name}守住城池，${side === "player" ? "我軍" : "敵軍"}退卻。`);
  }
  report.battles.push({
    side,
    from: from.id,
    target: target.id,
    defenderStartedWith,
    attackerLoss: result.attackerLoss,
    defenderLoss: result.defenderLoss,
    captured: target.owner === side,
  });
}

export function chooseAiOrders(game) {
  const enemy = game.cities.filter((city) => city.owner === "enemy");
  const orders = [];
  if (game.enemyResources.grain < 25) {
    const city = enemy.sort((a, b) => generalAt(game, b.id, "enemy").wit - generalAt(game, a.id, "enemy").wit)[0];
    return [{ type: "farm", cityId: city.id, side: "enemy" }];
  }
  const fronts = enemy.flatMap((city) =>
    neighborsOf(city.id)
      .map((id) => getCity(game, id))
      .filter((target) => target.owner !== "enemy")
      .map((target) => ({ city, target, ratio: city.troops / Math.max(1, target.troops + target.walls * 18) })),
  );
  fronts.sort((a, b) => b.ratio - a.ratio);
  const threshold = game.difficulty === "hard" ? 0.92 : 1.08;
  if (fronts[0]?.ratio > threshold && fronts[0].city.troops >= 55) {
    orders.push({
      type: "attack",
      from: fronts[0].city.id,
      to: fronts[0].target.id,
      troops: Math.min(fronts[0].city.troops - 12, game.difficulty === "hard" ? 95 : 72),
      side: "enemy",
    });
  } else {
    const threatened = [...enemy].sort((a, b) => a.troops + a.walls * 20 - (b.troops + b.walls * 20))[0];
    orders.push({ type: "fortify", cityId: threatened.id, side: "enemy" });
  }
  return orders;
}

function applyAiPreparation(game, order, report) {
  const city = getCity(game, order.cityId ?? order.from);
  if (order.type === "farm") {
    game.enemyResources.grain += 18;
    report.events.push(`敵軍在${city.name}廣積軍糧。`);
  } else if (order.type === "fortify" && city.walls < 5 && game.enemyResources.grain >= 5) {
    game.enemyResources.grain -= 5;
    city.walls += 1;
    report.events.push(`敵軍加固${city.name}城防。`);
  } else if (order.type === "attack") {
    game.enemyResources.grain = Math.max(0, game.enemyResources.grain - Math.ceil(order.troops / 9));
  }
}

function applySupply(game, owner, report) {
  const resource = owner === "player" ? game.resources : game.enemyResources;
  for (const city of game.cities.filter((item) => item.owner === owner)) {
    const supplied = isSupplied(game, city.id, owner);
    const upkeep = Math.ceil(city.troops / 55);
    if (supplied && resource.grain >= upkeep) {
      resource.grain -= upkeep;
      city.morale = Math.min(100, city.morale + 2);
      continue;
    }
    city.morale = Math.max(0, city.morale - 14);
    report.events.push(`${city.name}糧道斷絕，士氣下滑。`);
    if (city.morale < 20) {
      const deserters = Math.min(city.troops - 1, Math.max(5, Math.ceil(city.troops * 0.16)));
      city.troops -= deserters;
      report.events.push(`${city.name}有 ${deserters} 名士卒逃兵！`);
    }
  }
}

export function resolveTurn(game, aiOrders = null) {
  if (game.phase !== "planning") throw new Error("本局已結束");
  const next = cloneGame(game);
  const chosenAi = (aiOrders ?? chooseAiOrders(next)).map((order) => ({
    ...order,
    side: "enemy",
  }));
  const report = {
    turn: next.turn,
    orders: [...next.orders, ...chosenAi].map((order) => ({ ...order })),
    events: [],
    battles: [],
  };

  for (const order of chosenAi) applyAiPreparation(next, order, report);
  const attacks = [
    ...next.orders.filter((order) => order.type === "attack"),
    ...chosenAi.filter((order) => order.type === "attack"),
  ];
  attacks.forEach((order, index) =>
    executeAttack(next, order, order.side ?? "player", report, index),
  );
  applySupply(next, "player", report);
  applySupply(next, "enemy", report);

  const owned = next.cities.filter((city) => city.owner === "player").length;
  next.resources.grain += owned * 3;
  next.resources.support = Math.min(100, Math.max(0, next.resources.support + owned - 2));
  next.resources.soldiers = troopTotal(next, "player");
  next.rng = mix(next.rng, next.turn);
  next.turn += 1;
  next.actionsLeft = 3;
  next.orders = [];
  next.lastReport = report;
  next.history.push(report);

  const outcome = getOutcome(next);
  if (outcome.status !== "playing") next.phase = "ended";
  return next;
}

export function getOutcome(game) {
  const playerCapital = getCity(game, "p-cap");
  const enemyCapital = getCity(game, "e-cap");
  if (playerCapital.owner !== "player") {
    return { status: "lost", reason: "capital", message: "漢中失守，郡國傾覆。" };
  }
  if (enemyCapital.owner === "player") {
    return { status: "won", reason: "capital", message: "成都城破，捷報傳遍三軍！" };
  }
  if (game.mode === "defend" && game.turn > game.maxTurns) {
    return { status: "won", reason: "held", message: "十二回合已滿，你守住了漢中。" };
  }
  if (game.mode === "siege" && game.turn > game.maxTurns) {
    return { status: "lost", reason: "time", message: "軍令期限已至，成都仍未攻下。" };
  }
  return { status: "playing" };
}

export function scoreGame(game) {
  const cities = game.cities.filter((city) => city.owner === "player").length;
  const troops = troopTotal(game, "player");
  return Math.max(
    0,
    cities * 120 + troops + game.resources.grain * 2 + game.resources.support * 3 + (13 - Math.min(12, game.turn)) * 25,
  );
}
