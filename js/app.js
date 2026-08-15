import { loadContent } from "./content.js";
import * as gameStore from "./state.js";
import { pushGameState, TEAM_COLORS } from "./sync.js";
import { createMap, addCustomMarker, fitToMarkers, locateUser } from "./map.js";
import {
  formatHMS,
  formatMinSec,
  normalizeCode,
  showToast,
  vibrate,
  playEndChime,
} from "./utils.js";
import { playSuccessSound, playTrapSound, playVictorySound, initSoundToggle, startBackgroundMusic } from "./sound.js";

const $ = (sel) => document.querySelector(sel);

let CONTENT = null;
let TEAM = null;
let STATE = null;
let chronoTimer = null;
let trapTimer = null;
let convergenceTimer = null;
let map = null;
let alertedDuration = false;
let alertedMax = false;

function labelFor(color) {
  return CONTENT?.teams?.[color]?.label || `Équipe ${color[0].toUpperCase()}${color.slice(1)}`;
}

function show(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
  renderChronoTick();
  $("#btn-stop-game").style.display = STATE && STATE.status !== "not_started" ? "flex" : "none";
}

function persist() {
  gameStore.saveState(TEAM, STATE);
  pushGameState(TEAM, {
    status: STATE.status,
    currentEpreuveIndex: STATE.currentEpreuveIndex,
    startedAt: STATE.startedAt,
    finishedAt: STATE.finishedAt,
    currentTrapEndsAt: STATE.currentTrapEndsAt,
    trapCount: STATE.trapCount,
  });
}

// ---- Sélection équipe -----------------------------------------------------

function renderTeamGrid() {
  const grid = $("#team-grid");
  grid.innerHTML = "";
  for (const color of TEAM_COLORS) {
    const btn = document.createElement("button");
    btn.className = `team-btn ${color}`;
    btn.innerHTML = `<img src="./assets/badges/${color}.png" alt="" onerror="this.style.display='none'"><span>${labelFor(
      color
    )}</span>`;
    btn.addEventListener("click", () => selectTeam(color));
    grid.appendChild(btn);
  }
}

function selectTeam(color) {
  TEAM = color;
  gameStore.setSelectedTeam(color);
  STATE = gameStore.getState(color);
  document.body.dataset.team = color;
  alertedDuration = false;
  alertedMax = false;

  if (!CONTENT?.teams?.[color]) {
    showToast("Contenu introuvable pour cette équipe.");
    show("view-team-select");
    return;
  }

  if (STATE.status === "finished") {
    renderFinalView();
    show("view-final");
  } else if (STATE.status === "not_started") {
    renderStartView();
    show("view-start");
  } else {
    renderEpreuveView();
    show("view-epreuve");
    if (STATE.status === "trap") resumeTrapIfActive();
  }
  startChrono();
}

// ---- Écran de démarrage -----------------------------------------------------

function renderStartView() {
  const team = CONTENT.teams[TEAM];
  $("#start-team-name").textContent = team.label;
  $("#start-hero-name").textContent = team.heroName || "";
  const badge = $("#start-badge");
  badge.src = `./assets/badges/${TEAM}.png`;
  badge.onerror = () => (badge.style.visibility = "hidden");
  badge.style.visibility = "visible";

  const startBtn = $("#btn-start-mission");
  startBtn.textContent = STATE.status === "not_started" ? "🚀 Démarrer la mission" : "↩️ Reprendre la mission en cours";
}

// ---- Chronomètre général ----------------------------------------------------

function startChrono() {
  clearInterval(chronoTimer);
  renderChronoTick();
  chronoTimer = setInterval(renderChronoTick, 1000);
}

function renderChronoTick() {
  const wrap = $("#chrono-wrap");
  const activeView = document.querySelector(".view.active")?.id;
  const visible =
    STATE &&
    STATE.status !== "not_started" &&
    activeView !== "view-team-select" &&
    activeView !== "view-loading";
  if (!visible || !STATE.startedAt) {
    wrap.innerHTML = "";
    return;
  }
  const elapsed = Date.now() - STATE.startedAt;
  const durationMs = (CONTENT.config.durationMinutes || 120) * 60000;
  const maxMs = (CONTENT.config.maxDurationMinutes || 150) * 60000;
  let cls = "";
  if (elapsed >= durationMs - 15 * 60000) cls = "warn";
  if (elapsed >= durationMs) cls = "danger";
  wrap.innerHTML = `<div class="chrono ${cls}">
    <div><div class="chrono-label">Temps écoulé</div><div class="chrono-time">${formatHMS(elapsed)}</div></div>
    <div style="text-align:right"><div class="chrono-label">Objectif</div><div class="chrono-time" style="font-size:16px;">${
      CONTENT.config.durationMinutes || 120
    } min</div></div>
  </div>`;
  handleChronoAlerts(elapsed, durationMs, maxMs);
}

function handleChronoAlerts(elapsed, durationMs, maxMs) {
  if (!alertedDuration && elapsed >= durationMs) {
    alertedDuration = true;
    playEndChime();
    vibrate([200, 100, 200]);
    showToast("⏰ 2h00 atteintes, pensez à rejoindre le point de rassemblement.");
  }
  if (!alertedMax && elapsed >= maxMs) {
    alertedMax = true;
    playEndChime();
    vibrate([300, 100, 300, 100, 300]);
    showToast("🚨 Temps maximum (2h30) atteint !");
  }
}

// ---- Épreuve -----------------------------------------------------------------

function currentEpreuve() {
  return CONTENT.teams[TEAM].epreuves[STATE.currentEpreuveIndex];
}

function renderProgressDots() {
  const total = CONTENT.teams[TEAM].epreuves.length;
  const dots = $("#progress-dots");
  dots.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const d = document.createElement("div");
    d.className =
      "dot" +
      (i < STATE.currentEpreuveIndex ? " done" : "") +
      (i === STATE.currentEpreuveIndex ? " current" : "");
    dots.appendChild(d);
  }
}

function renderEpreuveView() {
  const ep = currentEpreuve();
  $("#epreuve-title").textContent = ep.titre || `Épreuve ${STATE.currentEpreuveIndex + 1}`;
  renderProgressDots();

  $("#lieu-titre").textContent = ep.lieu?.titre || "";
  $("#lieu-desc").textContent = ep.lieu?.description || "";
  $("#lieu-adresse").textContent = ep.lieu?.adresse ? `📍 ${ep.lieu.adresse}` : "";

  const objetCard = $("#card-objet");
  if (ep.objet && (ep.objet.titre || ep.objet.description)) {
    objetCard.style.display = "";
    $("#objet-titre").textContent = ep.objet.titre || "";
    $("#objet-desc").textContent = ep.objet.description || "";
  } else {
    objetCard.style.display = "none";
  }

  const indiceBtn = $("#btn-indice");
  const indiceCard = $("#card-indice");
  const hintShown = !!STATE.hintRevealed[STATE.currentEpreuveIndex];
  if (ep.indice) {
    indiceBtn.style.display = "";
    indiceBtn.textContent = hintShown ? "💡 Indice bonus affiché" : "💡 Voir l'indice bonus";
    indiceCard.style.display = hintShown ? "" : "none";
    $("#indice-text").textContent = ep.indice;
  } else {
    indiceBtn.style.display = "none";
    indiceCard.style.display = "none";
  }

  $("#card-revelation").style.display = "none";
  $("#code-form").style.display = "";
  $("#code-input").value = "";
  $("#code-feedback").textContent = "";
  setTimeout(() => $("#code-input")?.focus(), 50);
}

function onCodeCorrect(ep) {
  playSuccessSound();
  vibrate(120);
  $("#code-feedback").textContent = "";
  $("#code-form").style.display = "none";
  $("#btn-indice").style.display = "none";
  $("#card-indice").style.display = "none";
  $("#card-revelation").style.display = "";
  $("#revelation-text").textContent = ep.revelation?.texte || "Bravo, épreuve réussie !";
  STATE.wrongAttempts = 0;
  persist();
}

function onCodeWrong(ep) {
  STATE.wrongAttempts = (STATE.wrongAttempts || 0) + 1;
  const input = $("#code-input");
  input.classList.remove("shake");
  void input.offsetWidth;
  input.classList.add("shake");
  vibrate([80, 60, 80]);

  const seuil = ep.code?.essaisAvantPiege ?? 2;
  const feedback = $("#code-feedback");
  if (STATE.wrongAttempts >= seuil && ep.piege) {
    feedback.textContent = "";
    STATE.wrongAttempts = 0;
    triggerTrap(ep);
  } else {
    feedback.textContent = "Code incorrect, réessayez.";
    feedback.className = "code-feedback error";
  }
  persist();
}

// ---- Arrêter la partie ---------------------------------------------------------

function openStopConfirm() {
  $("#stop-confirm-overlay").style.display = "flex";
}

function closeStopConfirm() {
  $("#stop-confirm-overlay").style.display = "none";
}

function abandonGame() {
  clearInterval(chronoTimer);
  clearInterval(trapTimer);
  clearInterval(convergenceTimer);
  $("#trap-overlay").style.display = "none";
  closeStopConfirm();

  if (TEAM) {
    gameStore.resetState(TEAM);
    pushGameState(TEAM, {
      status: "not_started",
      currentEpreuveIndex: 0,
      startedAt: null,
      finishedAt: null,
      currentTrapEndsAt: null,
      trapCount: 0,
    });
  }
  gameStore.clearSelectedTeam();
  TEAM = null;
  STATE = null;
  delete document.body.dataset.team;
  $("#chrono-wrap").innerHTML = "";
  renderTeamGrid();
  show("view-team-select");
  showToast("Partie arrêtée — retour à la sélection d'équipe.");
}

function finishGame() {
  STATE.status = "finished";
  STATE.finishedAt = Date.now();
  persist();
  renderFinalView();
  show("view-final");
  playVictorySound();
  vibrate([150, 80, 150, 80, 300]);
}

// ---- Piège --------------------------------------------------------------------

function triggerTrap(ep) {
  STATE.status = "trap";
  const dureeMs = (ep.piege?.dureeMinutes ?? 2) * 60000;
  STATE.currentTrapEndsAt = Date.now() + dureeMs;
  STATE.trapCount = (STATE.trapCount || 0) + 1;
  persist();
  showTrapOverlay(ep);
}

function showTrapOverlay(ep) {
  playTrapSound();
  vibrate([300, 100, 300, 100, 300]);
  $("#trap-text").textContent = ep.piege?.texte || "Piège déclenché !";
  $("#trap-overlay").style.display = "flex";
  clearInterval(trapTimer);
  trapTimer = setInterval(() => {
    const remain = STATE.currentTrapEndsAt - Date.now();
    if (remain <= 0) {
      clearInterval(trapTimer);
      $("#trap-overlay").style.display = "none";
      STATE.status = "in_progress";
      STATE.currentTrapEndsAt = null;
      persist();
      renderEpreuveView();
      showToast("✅ Pénalité terminée, vous pouvez continuer !");
      playSuccessSound();
      vibrate(150);
    } else {
      $("#trap-time").textContent = formatMinSec(remain);
    }
  }, 250);
}

function resumeTrapIfActive() {
  const ep = currentEpreuve();
  if (STATE.status === "trap" && STATE.currentTrapEndsAt) {
    if (STATE.currentTrapEndsAt <= Date.now()) {
      STATE.status = "in_progress";
      STATE.currentTrapEndsAt = null;
      persist();
      renderEpreuveView();
    } else {
      showTrapOverlay(ep);
    }
  }
}

// ---- Finale ---------------------------------------------------------------------

function renderFinalView() {
  const conv = CONTENT.config.convergence || {};
  $("#final-lieu-name").textContent = conv.name || "Place Benjamin Zix";
  $("#final-lieu-detail").textContent = conv.detail || "";
  $("#final-time").textContent = conv.time || "—";
  startConvergenceCountdown(conv);
}

function nextOccurrenceOfTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0).getTime();
}

function startConvergenceCountdown(conv) {
  clearInterval(convergenceTimer);
  if (!conv.time) {
    $("#final-countdown").textContent = "";
    return;
  }
  const target = nextOccurrenceOfTime(conv.time);
  const tick = () => {
    const diff = target - Date.now();
    $("#final-countdown").textContent =
      diff > 0 ? `dans ${formatHMS(diff)}` : "C'est l'heure du rassemblement !";
  };
  tick();
  convergenceTimer = setInterval(tick, 1000);
}

// ---- Carte ------------------------------------------------------------------------

function openMap(finalOnly = false) {
  $("#map-modal").style.display = "flex";
  $("#map-modal-title").textContent = finalOnly
    ? "Itinéraire vers le rassemblement"
    : currentEpreuve().lieu?.titre || "Carte";

  void document.getElementById("leaflet-map").offsetHeight;

  if (map) {
    map.remove();
    map = null;
  }
  const conv = CONTENT.config.convergence;
  const center = finalOnly ? [conv.lat, conv.lng] : [currentEpreuve().lieu.lat, currentEpreuve().lieu.lng];
  map = createMap("leaflet-map", center, 16);
  const points = [];
  if (!finalOnly) {
    const ep = currentEpreuve();
    addCustomMarker(map, ep.lieu.lat, ep.lieu.lng, {
      color: getComputedStyle(document.body).getPropertyValue("--team-color").trim() || "#2563eb",
      imgUrl: `./assets/badges/${TEAM}.png`,
      emoji: "📍",
      label: ep.lieu.titre,
    });
    points.push([ep.lieu.lat, ep.lieu.lng]);
  }
  if (conv) {
    addCustomMarker(map, conv.lat, conv.lng, {
      color: "#ffd12e",
      imgUrl: "./assets/logo.png",
      emoji: "🏁",
      big: true,
      label: conv.name,
    });
    points.push([conv.lat, conv.lng]);
  }
  fitToMarkers(map, points);
  addLocateButton();
  setTimeout(() => map && map.invalidateSize(), 60);
}

function addLocateButton() {
  const container = document.getElementById("leaflet-map");
  const old = container.querySelector(".map-locate-btn");
  if (old) old.remove();
  const btn = document.createElement("button");
  btn.className = "map-locate-btn";
  btn.textContent = "📍";
  btn.addEventListener("click", () => locateUser(map, (lat, lng) => map.setView([lat, lng], 16)));
  container.appendChild(btn);
}

function closeMap() {
  $("#map-modal").style.display = "none";
  if (map) {
    map.remove();
    map = null;
  }
}

// ---- Statut réseau ------------------------------------------------------------------

function updateSyncBadge() {
  const badge = $("#sync-badge");
  const online = navigator.onLine;
  badge.className = "sync-badge " + (online ? "online" : "offline");
  $("#sync-label").textContent = online ? "En ligne" : "Hors-ligne";
}

// ---- Câblage des événements -----------------------------------------------------------

function initListeners() {
  $("#btn-start-mission").addEventListener("click", () => {
    if (STATE.status === "not_started") {
      STATE.status = "in_progress";
      STATE.startedAt = Date.now();
      persist();
    }
    renderEpreuveView();
    show("view-epreuve");
    startChrono();
  });

  $("#btn-back-to-start").addEventListener("click", () => {
    renderStartView();
    show("view-start");
  });

  $("#btn-stop-game").addEventListener("click", openStopConfirm);
  $("#btn-stop-game-trap").addEventListener("click", openStopConfirm);
  $("#btn-stop-cancel").addEventListener("click", closeStopConfirm);
  $("#btn-stop-confirm").addEventListener("click", abandonGame);

  $("#btn-change-team").addEventListener("click", () => {
    gameStore.clearSelectedTeam();
    TEAM = null;
    STATE = null;
    delete document.body.dataset.team;
    clearInterval(chronoTimer);
    show("view-team-select");
  });

  $("#btn-reset-progress").addEventListener("click", () => {
    if (confirm("Réinitialiser la progression de cette équipe ? (mode test uniquement)")) {
      gameStore.resetState(TEAM);
      STATE = gameStore.defaultState();
      renderStartView();
      showToast("Progression réinitialisée.");
    }
  });

  $("#btn-indice").addEventListener("click", () => {
    STATE.hintRevealed[STATE.currentEpreuveIndex] = true;
    persist();
    renderEpreuveView();
  });

  $("#code-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const ep = currentEpreuve();
    const val = normalizeCode($("#code-input").value);
    const expected = normalizeCode(ep.code?.valeur);
    if (!expected) return;
    if (val === expected) onCodeCorrect(ep);
    else onCodeWrong(ep);
  });

  $("#btn-next-epreuve").addEventListener("click", () => {
    const total = CONTENT.teams[TEAM].epreuves.length;
    if (STATE.currentEpreuveIndex + 1 >= total) {
      finishGame();
    } else {
      STATE.currentEpreuveIndex += 1;
      persist();
      renderEpreuveView();
    }
  });

  $("#btn-open-map").addEventListener("click", () => openMap(false));
  $("#btn-final-map").addEventListener("click", () => openMap(true));
  $("#btn-close-map").addEventListener("click", closeMap);

  window.addEventListener("online", updateSyncBadge);
  window.addEventListener("offline", updateSyncBadge);

  window.addEventListener("aquapolis:content-updated", (e) => {
    if (!STATE || STATE.status === "not_started") {
      CONTENT = e.detail;
      renderTeamGrid();
    }
  });
}

// ---- Démarrage -------------------------------------------------------------------------

async function boot() {
  initListeners();
  initSoundToggle();
  startBackgroundMusic();
  updateSyncBadge();
  CONTENT = await loadContent();
  if (!CONTENT) {
    $("#view-loading").innerHTML =
      '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px;"><div style="font-size:48px;">⚠️</div><h2>Chargement impossible</h2><p class="muted">Connectez-vous une première fois à Internet, puis rechargez la page.</p></div>';
    return;
  }
  renderTeamGrid();
  const saved = gameStore.getSelectedTeam();
  if (saved && CONTENT.teams?.[saved]) {
    selectTeam(saved);
  } else {
    show("view-team-select");
  }
}

boot();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
