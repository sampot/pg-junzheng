import { WarAudio } from "./audio.js";
import {
  DECREE_NAMES,
  EDGES,
  applyDecree,
  createGame,
  getOutcome,
  isAdjacent,
  isSupplied,
  resolveTurn,
  scoreGame,
} from "./game.js";
import {
  loadBest,
  loadSettings,
  loadUnlocks,
  saveBest,
  saveSettings,
  saveUnlocks,
} from "./persist.js";

const $ = (selector) => document.querySelector(selector);
const audio = new WarAudio();
const ownerNames = { player: "我軍", enemy: "敵軍", neutral: "中立守軍" };
let game = null;
let mode = "siege";
let selectedCityId = "p-cap";
let selectedAction = null;
let selectedTarget = null;
let best = 0;
let unlocks = [];
let settings = { muted: false, difficulty: "normal" };

function city(id) {
  return game.cities.find((item) => item.id === id);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderRoads() {
  $("#roads").innerHTML = EDGES.map(([a, b]) => {
    const from = city(a);
    const to = city(b);
    return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
  }).join("");
}

function targetIds() {
  if (!selectedAction) return [];
  return game.cities
    .filter((candidate) => isAdjacent(selectedCityId, candidate.id))
    .filter((candidate) =>
      selectedAction === "move"
        ? candidate.owner === "player"
        : candidate.owner !== "player",
    )
    .map((candidate) => candidate.id);
}

function renderCities() {
  const targets = new Set(targetIds());
  $("#cities").innerHTML = game.cities
    .map((item) => {
      const known = item.owner === "player" || game.intel[item.id]?.turn === game.turn;
      const soldiers = known ? `${item.troops}兵` : "兵力？";
      return `<button type="button" class="city ${item.owner} ${item.capital ? "capital" : ""} ${item.id === selectedCityId ? "selected" : ""} ${targets.has(item.id) ? "target" : ""}" data-city="${item.id}" style="left:${item.x}%;top:${item.y}%" aria-label="${escapeHtml(item.name)}，${ownerNames[item.owner]}，${soldiers}">
        <strong>${escapeHtml(item.name)}</strong><small>${soldiers}</small>
      </button>`;
    })
    .join("");
  document.querySelectorAll("[data-city]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.city;
      if (targetIds().includes(id)) {
        selectedTarget = id;
        renderOrderForm();
      } else {
        selectedCityId = id;
        selectedAction = null;
        selectedTarget = null;
        $("#order-form").hidden = true;
      }
      audio.play("click");
      render();
    });
  });
}

function renderHud() {
  $("#turn-value").textContent = `${Math.min(game.turn, 12)} / 12`;
  $("#actions-value").textContent = `${"●".repeat(game.actionsLeft)}${"○".repeat(3 - game.actionsLeft)}`;
  $("#grain-value").textContent = String(game.resources.grain);
  $("#soldiers-value").textContent = String(game.resources.soldiers);
  $("#support-value").textContent = String(game.resources.support);
  $("#decree-count").textContent = `尚餘 ${game.actionsLeft} 令`;
  $("#objective").innerHTML =
    game.mode === "siege"
      ? `<strong>攻城軍令：</strong>第十二回合結束前攻取敵都成都。`
      : `<strong>守郡軍令：</strong>漢中不可失，堅守至第十二回合結束。`;
}

function renderCityCard() {
  const selected = city(selectedCityId);
  const visible = selected.owner === "player" || game.intel[selected.id]?.turn === game.turn;
  const intel = game.intel[selected.id];
  const supply =
    selected.owner === "neutral"
      ? "無固定糧道"
      : isSupplied(game, selected.id, selected.owner)
        ? "糧道暢通"
        : "糧道斷絕";
  const general = game.generals.find((item) => item.cityId === selected.id);
  $("#city-card").innerHTML = `
    <div class="city-heading"><div><p class="kicker">${selected.capital ? "一方都城" : "蜀道城寨"}</p><h2>${escapeHtml(selected.name)}</h2></div><span class="owner-badge">${ownerNames[selected.owner]}</span></div>
    <div class="city-stats">
      <div><span>兵力</span><strong>${visible ? selected.troops : "？"}</strong></div>
      <div><span>士氣</span><strong>${visible ? selected.morale : "？"}</strong></div>
      <div><span>城防</span><strong>${visible ? selected.walls : "？"}</strong></div>
    </div>
    <p class="supply ${supply.includes("斷") ? "cut" : ""}">${supply}${general ? ` · ${general.name}駐守` : ""}${intel && !intel.exact ? " · 情報為估計" : ""}</p>
  `;
}

function renderGenerals() {
  $("#general-list").innerHTML = game.generals
    .map((general) => `
      <article class="general">
        <span class="portrait">${general.name.slice(0, 1)}</span>
        <span><strong>${general.name}</strong><small>${city(general.cityId)?.name ?? "行軍中"} · ${general.trait}</small></span>
        <span>武 ${general.might}<br>智 ${general.wit}</span>
      </article>`)
    .join("");
}

function renderDecrees() {
  const friendly = city(selectedCityId).owner === "player";
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.disabled = !friendly || game.actionsLeft === 0;
    button.classList.toggle("selected", button.dataset.action === selectedAction);
  });
  $("#end-turn").textContent =
    game.actionsLeft === 0 ? "三令已定 · 擊鼓揭示" : `擊鼓揭示 · 尚可下 ${game.actionsLeft} 令`;
}

function render() {
  if (!game) return;
  renderHud();
  renderRoads();
  renderCities();
  renderCityCard();
  renderGenerals();
  renderDecrees();
}

function apply(action) {
  try {
    game = applyDecree(game, action);
    globalThis.__junzheng = { getGame: () => game };
    selectedAction = null;
    selectedTarget = null;
    $("#order-form").hidden = true;
    $("#order-message").textContent = `${DECREE_NAMES[action.type]}已入軍簿。`;
    audio.play(action.type === "attack" ? "battle" : "click");
    render();
  } catch (error) {
    $("#order-message").textContent = error.message;
    audio.play("battle");
  }
}

function renderOrderForm() {
  const source = city(selectedCityId);
  const targets = targetIds();
  if (!targets.includes(selectedTarget)) selectedTarget = targets[0] ?? null;
  const needsTroops = ["move", "attack"].includes(selectedAction);
  const max = Math.max(10, source.troops - 10);
  $("#order-form").hidden = false;
  $("#order-form").innerHTML = `
    <strong>${DECREE_NAMES[selectedAction]} · 自 ${escapeHtml(source.name)}</strong>
    ${targets.length ? `<div class="target-list">${targets.map((id) => `<button type="button" data-target="${id}" class="${id === selectedTarget ? "selected" : ""}">${escapeHtml(city(id).name)}</button>`).join("")}</div>` : `<p>沒有合法的相鄰目標。</p>`}
    ${needsTroops && targets.length ? `<label class="troop-row" for="troop-count"><span>派出兵力</span><output id="troop-output">${Math.min(40, max)}</output></label><input id="troop-count" type="range" min="10" max="${max}" step="10" value="${Math.min(40, max)}">` : ""}
    ${targets.length ? `<button id="confirm-order" class="primary big" type="button">登錄${DECREE_NAMES[selectedAction]}</button>` : ""}
  `;
  document.querySelectorAll("[data-target]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTarget = button.dataset.target;
      audio.play("click");
      renderOrderForm();
      renderCities();
    });
  });
  const slider = $("#troop-count");
  slider?.addEventListener("input", () => {
    $("#troop-output").textContent = slider.value;
  });
  $("#confirm-order")?.addEventListener("click", () => {
    const action = { type: selectedAction, from: selectedCityId, to: selectedTarget };
    if (needsTroops) action.troops = Number($("#troop-count").value);
    apply(action);
  });
}

function selectAction(type) {
  if (city(selectedCityId).owner !== "player") {
    $("#order-message").textContent = "先在地圖點選我方城市。";
    return;
  }
  $("#order-message").textContent = "";
  if (["farm", "recruit", "fortify"].includes(type)) {
    apply({ type, cityId: selectedCityId });
    return;
  }
  selectedAction = type;
  selectedTarget = null;
  renderOrderForm();
  render();
}

function reportHtml(report) {
  const orders = report.orders
    .map((order) => `<li>${order.side === "enemy" ? "敵軍" : "我軍"} · ${DECREE_NAMES[order.type] ?? order.type}${order.to ? ` → ${city(order.to).name}` : ""}</li>`)
    .join("");
  const battles = report.battles
    .map((battle) => `<div class="battle-row"><strong>${city(battle.from).name} → ${city(battle.target).name}</strong><br>攻方折 ${battle.attackerLoss} · 守方折 ${battle.defenderLoss} · ${battle.captured ? "城池易主" : "守軍不退"}</div>`)
    .join("");
  const events = report.events.length
    ? `<ul>${report.events.map((event) => `<li>${escapeHtml(event)}</li>`).join("")}</ul>`
    : "<p>本回合兩軍按兵不動。</p>";
  return `<p>第 ${report.turn} 回合，敵我軍令同時揭示。</p><ul>${orders}</ul>${battles}${events}`;
}

async function showEnd() {
  const outcome = getOutcome(game);
  const score = scoreGame(game);
  best = await saveBest(score, best);
  if (outcome.status === "won" && !unlocks.includes(game.mode)) {
    unlocks = await saveUnlocks([...unlocks, game.mode]);
  }
  $("#best-value").textContent = String(best);
  $("#end-seal").textContent = outcome.status === "won" ? "勝" : "敗";
  $("#end-kicker").textContent = outcome.status === "won" ? "捷報入京" : "軍令未成";
  $("#end-title").textContent = outcome.status === "won" ? "一郡安定，三軍振奮" : "蜀道烽煙未歇";
  $("#end-message").textContent = outcome.message;
  $("#end-stats").innerHTML = `
    <div><span>戰功</span><strong>${score}</strong></div>
    <div><span>城池</span><strong>${game.cities.filter((item) => item.owner === "player").length}</strong></div>
    <div><span>餘兵</span><strong>${game.resources.soldiers}</strong></div>`;
  $("#end-sheet").hidden = false;
  $("#again-button").focus();
  audio.play(outcome.status === "won" ? "victory" : "battle");
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-checked", String(selected));
    });
    audio.play("click");
  });
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => selectAction(button.dataset.action));
});

$("#start-button").addEventListener("click", async () => {
  settings.difficulty = $("#difficulty").value;
  await saveSettings(settings);
  await audio.start();
  audio.play("drum");
  game = createGame({ seed: Date.now(), mode, difficulty: settings.difficulty });
  selectedCityId = "p-cap";
  selectedAction = null;
  $("#lobby").hidden = true;
  $("#game-view").hidden = false;
  render();
  $("#end-turn").focus();
});

$("#end-turn").addEventListener("click", () => {
  audio.play("drum");
  game = resolveTurn(game);
  globalThis.__junzheng = { getGame: () => game };
  selectedAction = null;
  selectedTarget = null;
  $("#order-form").hidden = true;
  $("#report-content").innerHTML = reportHtml(game.lastReport);
  const outcome = getOutcome(game);
  $("#report-close").textContent = outcome.status === "playing" ? "整軍再議" : "查看結局";
  $("#report-sheet").hidden = false;
  render();
  $("#report-close").focus();
  if (game.lastReport.battles.length) audio.play("battle");
});

$("#report-close").addEventListener("click", () => {
  $("#report-sheet").hidden = true;
  if (getOutcome(game).status !== "playing") void showEnd();
  else $("#end-turn").focus();
});

$("#again-button").addEventListener("click", () => {
  $("#end-sheet").hidden = true;
  $("#game-view").hidden = true;
  $("#lobby").hidden = false;
  game = null;
  $("#start-button").focus();
});

$("#sound-toggle").addEventListener("click", () => {
  settings.muted = audio.enabled;
  audio.setEnabled(!settings.muted);
  $("#sound-toggle").textContent = audio.enabled ? "♫ 音效開" : "♩ 靜音";
  $("#sound-toggle").setAttribute("aria-pressed", String(audio.enabled));
  void saveSettings(settings);
  if (audio.enabled) audio.play("click");
});

$("#about-button").addEventListener("click", () => {
  $("#about-sheet").hidden = false;
  $("#about-close").focus();
  audio.play("click");
});
$("#about-close").addEventListener("click", () => {
  $("#about-sheet").hidden = true;
  $("#about-button").focus();
  audio.play("click");
});

[best, unlocks, settings] = await Promise.all([loadBest(), loadUnlocks(), loadSettings()]);
settings = { muted: false, difficulty: "normal", ...settings };
audio.setEnabled(!settings.muted);
$("#difficulty").value = settings.difficulty;
$("#best-value").textContent = String(best);
$("#sound-toggle").textContent = audio.enabled ? "♫ 音效開" : "♩ 靜音";
$("#sound-toggle").setAttribute("aria-pressed", String(audio.enabled));
