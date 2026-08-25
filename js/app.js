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

const ACCESS_CODE = "ETIENNE";
const ACCESS_INTRO_DEFAULT =
  "⚡ Alerte rouge sur les canaux de Strasbourg : le super-vilain Déversoir sème la panique parmi les écluses. Un renfort inattendu vient d'arriver en ville — un héros dont le nom seul suffit à redonner espoir aux agents VNF. Saisissez son nom pour débloquer la mission et rejoindre le combat.";

const MORSE_MAP = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....",
  I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.",
  Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..",
  0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....",
  6: "-....", 7: "--...", 8: "---..", 9: "----.",
};

let CONTENT = null;
let TEAM = null;
let STATE = null;
let chronoTimer = null;
let trapTimer = null;
let convergenceTimer = null;
let map = null;
let resultMap = null;
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
  document.body.classList.toggle("on-landing", viewId === "view-team-select");
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

// ---- Modèle des épreuves (gère l'épreuve finale partagée + migration pages) --------

function normalizeEpreuve(ep) {
  if (!ep) return ep;
  if (ep.pages) return ep;
  return { ...ep, pages: [{ blocks: ep.blocks || [] }] };
}

function totalEpreuvesForTeam(color) {
  return (CONTENT.teams[color]?.epreuves.length || 0) + 1; // +1 pour l'épreuve finale commune
}

function epreuveAt(color, index) {
  const teamEpreuves = CONTENT.teams[color].epreuves;
  if (index < teamEpreuves.length) return normalizeEpreuve(teamEpreuves[index]);
  return normalizeEpreuve(CONTENT.finalEpreuve || { titre: "Épreuve finale", pages: [{ blocks: [] }] });
}

function currentEpreuve() {
  return epreuveAt(TEAM, STATE.currentEpreuveIndex);
}

function currentPages() {
  return currentEpreuve().pages || [{ blocks: [] }];
}

// ---- Écran de code d'accès --------------------------------------------------------

function initAccessCodeScreen() {
  $("#access-intro-text").textContent = ACCESS_INTRO_DEFAULT;
}

function proceedAfterAccess() {
  renderTeamGrid();
  const saved = gameStore.getSelectedTeam();
  if (saved && CONTENT.teams?.[saved]) {
    selectTeam(saved);
  } else {
    show("view-team-select");
  }
}

// ---- Sélection équipe -----------------------------------------------------

function renderTeamGrid() {
  const grid = $("#team-grid");
  grid.innerHTML = "";
  for (const color of TEAM_COLORS) {
    const btn = document.createElement("button");
    btn.className = "team-btn-img";
    btn.type = "button";
    btn.setAttribute("aria-label", labelFor(color));
    const img = document.createElement("img");
    img.src = `./assets/team-buttons/${color}.webp`;
    img.alt = labelFor(color);
    img.onerror = () => {
      btn.classList.add("team-btn-fallback", color);
      btn.textContent = labelFor(color);
    };
    btn.appendChild(img);
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

  $("#start-epreuve-count").textContent = `${totalEpreuvesForTeam(TEAM)} épreuves`;

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
    activeView !== "view-loading" &&
    activeView !== "view-access-code";
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

function renderProgressDots() {
  const total = totalEpreuvesForTeam(TEAM);
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
  renderPage();
}

function renderPage() {
  const pages = currentPages();
  if (STATE.currentPageIndex == null || STATE.currentPageIndex >= pages.length) {
    STATE.currentPageIndex = pages.length - 1;
  }
  if (STATE.currentPageIndex < 0) STATE.currentPageIndex = 0;
  const page = pages[STATE.currentPageIndex];
  const isLastPage = STATE.currentPageIndex === pages.length - 1;

  renderBlocks(page);

  const nav = $("#page-nav");
  if (pages.length > 1) {
    nav.style.display = "flex";
    $("#page-indicator").textContent = `Page ${STATE.currentPageIndex + 1}/${pages.length}`;
    $("#btn-prev-page").style.visibility = STATE.currentPageIndex === 0 ? "hidden" : "visible";
    $("#btn-next-page").style.display = isLastPage ? "none" : "";
  } else {
    nav.style.display = "none";
  }

  $("#card-code").style.display = isLastPage ? "" : "none";
  $("#card-revelation").style.display = "none";
  $("#code-form").style.display = "";
  $("#code-input").value = "";
  $("#code-feedback").textContent = "";
  if (isLastPage) setTimeout(() => $("#code-input")?.focus(), 50);
}

function renderBlocks(page) {
  const container = $("#blocks-container");
  container.innerHTML = "";
  const idx = STATE.currentEpreuveIndex;
  if (!STATE.revealedBlocks[idx]) STATE.revealedBlocks[idx] = [];
  const revealedIds = STATE.revealedBlocks[idx];
  (page.blocks || [])
    .filter((b) => b.visible)
    .forEach((block) => container.appendChild(renderBlock(block, revealedIds)));
}

function renderBlock(block, revealedIds) {
  const el = document.createElement("div");
  switch (block.type) {
    case "texte": {
      el.className = "card block-texte";
      el.innerHTML = block.html || "";
      break;
    }
    case "photo": {
      el.className = "card block-photo";
      if (block.url) {
        const img = document.createElement("img");
        img.src = block.url;
        img.alt = block.caption || "";
        img.loading = "lazy";
        img.addEventListener("click", () => openLightbox(block.url, block.caption || ""));
        el.appendChild(img);
      }
      if (block.caption) {
        const p = document.createElement("p");
        p.className = "muted";
        p.style.marginTop = "8px";
        p.textContent = block.caption;
        el.appendChild(p);
      }
      break;
    }
    case "video": {
      el.className = "card block-video";
      if (block.youtubeId) {
        const wrap = document.createElement("div");
        wrap.className = "video-embed";
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(block.youtubeId)}`;
        iframe.title = "Vidéo";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        iframe.allowFullscreen = true;
        iframe.loading = "lazy";
        wrap.appendChild(iframe);
        el.appendChild(wrap);
      }
      break;
    }
    case "carte": {
      el.className = "card block-carte";
      const a = document.createElement("a");
      a.href = block.url || "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "btn btn-outline btn-block";
      a.textContent = "🗺️ " + (block.label || "Voir l'itinéraire");
      el.appendChild(a);
      break;
    }
    case "audio": {
      el.className = "card block-audio";
      const head = document.createElement("div");
      head.className = "card-head";
      const pict = document.createElement("div");
      pict.className = "card-pict";
      pict.textContent = "🎧";
      const fam = document.createElement("div");
      fam.className = "card-family";
      fam.textContent = block.label || "Message audio";
      head.appendChild(pict);
      head.appendChild(fam);
      el.appendChild(head);
      if (block.url) {
        el.appendChild(buildAudioPlayer(block.url));
      } else {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = "(fichier audio à venir)";
        el.appendChild(p);
      }
      const morseBtn = document.createElement("button");
      morseBtn.type = "button";
      morseBtn.className = "btn btn-ghost btn-sm audio-morse-link";
      morseBtn.textContent = "📡 Voir l'alphabet morse";
      morseBtn.addEventListener("click", openMorseModal);
      el.appendChild(morseBtn);
      break;
    }
    case "indice": {
      el.className = "card block-indice";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost btn-block";
      const already = revealedIds.includes(block.id);
      btn.textContent = already ? "💡 Revoir l'indice" : "💡 Voir l'indice";
      btn.addEventListener("click", () => {
        const modalOpen = $("#indice-modal").style.display === "flex";
        if (modalOpen) {
          closeIndiceModal();
          return;
        }
        if (!revealedIds.includes(block.id)) {
          revealedIds.push(block.id);
          persist();
          btn.textContent = "💡 Revoir l'indice";
        }
        openIndiceModal(block.texte || "");
      });
      el.appendChild(btn);
      break;
    }
  }
  return el;
}

// ---- Lecteur audio (bloc "audio") --------------------------------------------------

function buildAudioPlayer(url) {
  const wrap = document.createElement("div");
  wrap.className = "audio-player";

  const audio = new Audio(url);
  audio.preload = "metadata";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "audio-play-btn";
  playBtn.textContent = "▶";
  playBtn.setAttribute("aria-label", "Lecture");

  const track = document.createElement("div");
  track.className = "audio-progress-track";
  const fill = document.createElement("div");
  fill.className = "audio-progress-fill";
  track.appendChild(fill);

  const time = document.createElement("span");
  time.className = "audio-time";
  time.textContent = "0:00";

  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch(() => showToast("Lecture audio impossible."));
    } else {
      audio.pause();
    }
  });
  audio.addEventListener("play", () => (playBtn.textContent = "⏸"));
  audio.addEventListener("pause", () => (playBtn.textContent = "▶"));
  audio.addEventListener("ended", () => (playBtn.textContent = "▶"));
  audio.addEventListener("timeupdate", () => {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    fill.style.width = pct + "%";
    time.textContent = formatMinSec(audio.currentTime * 1000);
  });
  track.addEventListener("click", (e) => {
    if (!audio.duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  });

  wrap.appendChild(playBtn);
  wrap.appendChild(track);
  wrap.appendChild(time);
  return wrap;
}

// ---- Modale indice ------------------------------------------------------------------

function openIndiceModal(text) {
  $("#indice-modal-text").textContent = text;
  $("#indice-modal").style.display = "flex";
}
function closeIndiceModal() {
  $("#indice-modal").style.display = "none";
}

// ---- Lightbox image -----------------------------------------------------------------

function openLightbox(url, alt) {
  $("#lightbox-img").src = url;
  $("#lightbox-img").alt = alt || "";
  $("#lightbox-modal").style.display = "flex";
}
function closeLightbox() {
  $("#lightbox-modal").style.display = "none";
  $("#lightbox-img").src = "";
}

// ---- Table morse --------------------------------------------------------------------

function renderMorseTableOnce() {
  const el = $("#morse-table");
  if (el.children.length) return;
  Object.entries(MORSE_MAP).forEach(([letter, code]) => {
    const cell = document.createElement("div");
    cell.className = "morse-cell";
    const l = document.createElement("span");
    l.className = "letter";
    l.textContent = letter;
    const c = document.createElement("span");
    c.className = "code";
    c.textContent = code;
    cell.appendChild(l);
    cell.appendChild(c);
    el.appendChild(cell);
  });
}
function openMorseModal() {
  renderMorseTableOnce();
  $("#morse-modal").style.display = "flex";
}
function closeMorseModal() {
  $("#morse-modal").style.display = "none";
}

// ---- Validation code / révélation ----------------------------------------------------

function onCodeCorrect(ep) {
  playSuccessSound();
  vibrate(120);
  $("#code-feedback").textContent = "";
  $("#code-form").style.display = "none";
  $("#page-nav").style.display = "none";
  $("#card-revelation").style.display = "";
  $("#revelation-text").textContent = ep.revelation?.texte || "Bravo, épreuve réussie !";
  renderResultMap();
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

// ---- Carte sur l'écran résultat (point vers la prochaine épreuve) --------------------

function renderResultMap() {
  const wrap = $("#result-map-wrap");
  const total = totalEpreuvesForTeam(TEAM);
  const nextIndex = STATE.currentEpreuveIndex + 1;
  let target = null;
  let label = "";

  if (nextIndex < total) {
    const nextEp = epreuveAt(TEAM, nextIndex);
    if (nextEp.lieu?.lat && nextEp.lieu?.lng) {
      target = nextEp.lieu;
      label = nextEp.titre || "Prochaine épreuve";
    }
  } else {
    const conv = CONTENT.config.convergence;
    if (conv) {
      target = conv;
      label = conv.name || "Rassemblement";
    }
  }

  if (!target) {
    wrap.style.display = "none";
    return;
  }

  wrap.style.display = "block";
  void document.getElementById("result-map").offsetHeight;
  if (resultMap) {
    resultMap.remove();
    resultMap = null;
  }
  resultMap = createMap("result-map", [target.lat, target.lng], 15);
  addCustomMarker(resultMap, target.lat, target.lng, {
    color: getComputedStyle(document.body).getPropertyValue("--team-color").trim() || "#2563eb",
    imgUrl: `./assets/badges/${TEAM}.png`,
    emoji: "📍",
    label,
  });
  setTimeout(() => resultMap && resultMap.invalidateSize(), 60);
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

// ---- Carte (modale) — itinéraire final uniquement ------------------------------------

function openMap() {
  $("#map-modal").style.display = "flex";
  $("#map-modal-title").textContent = "Itinéraire vers le rassemblement";
  void document.getElementById("leaflet-map").offsetHeight;
  if (map) {
    map.remove();
    map = null;
  }
  const conv = CONTENT.config.convergence;
  if (!conv) return;
  map = createMap("leaflet-map", [conv.lat, conv.lng], 16);
  addCustomMarker(map, conv.lat, conv.lng, {
    color: "#ffd12e",
    imgUrl: "./assets/logo.png",
    emoji: "🏁",
    big: true,
    label: conv.name,
  });
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
  $("#access-code-input").addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  $("#access-code-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#access-code-input");
    const val = normalizeCode(input.value);
    if (val === normalizeCode(ACCESS_CODE)) {
      gameStore.setAccessUnlocked();
      $("#access-code-feedback").textContent = "";
      proceedAfterAccess();
    } else {
      $("#access-code-feedback").textContent = "Nom incorrect. Réessayez.";
      input.classList.remove("shake");
      void input.offsetWidth;
      input.classList.add("shake");
      vibrate([80, 60, 80]);
    }
  });

  $("#btn-start-mission").addEventListener("click", () => {
    if (STATE.status === "not_started") {
      STATE.status = "in_progress";
      STATE.startedAt = Date.now();
      STATE.currentPageIndex = 0;
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

  $("#btn-prev-page").addEventListener("click", () => {
    if (STATE.currentPageIndex > 0) {
      STATE.currentPageIndex -= 1;
      persist();
      renderPage();
    }
  });

  $("#btn-next-page").addEventListener("click", () => {
    const pages = currentPages();
    if (STATE.currentPageIndex < pages.length - 1) {
      STATE.currentPageIndex += 1;
      persist();
      renderPage();
    }
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
    const total = totalEpreuvesForTeam(TEAM);
    if (STATE.currentEpreuveIndex + 1 >= total) {
      finishGame();
    } else {
      STATE.currentEpreuveIndex += 1;
      STATE.currentPageIndex = 0;
      persist();
      renderEpreuveView();
    }
  });

  $("#btn-close-indice").addEventListener("click", closeIndiceModal);
  $("#indice-modal").addEventListener("click", (e) => {
    if (e.target.id === "indice-modal") closeIndiceModal();
  });

  $("#btn-close-lightbox").addEventListener("click", closeLightbox);
  $("#lightbox-modal").addEventListener("click", (e) => {
    if (e.target.id === "lightbox-modal") closeLightbox();
  });

  $("#btn-close-morse").addEventListener("click", closeMorseModal);
  $("#morse-modal").addEventListener("click", (e) => {
    if (e.target.id === "morse-modal") closeMorseModal();
  });

  $("#btn-final-map").addEventListener("click", openMap);
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
  initAccessCodeScreen();
  CONTENT = await loadContent();
  if (!CONTENT) {
    $("#view-loading").innerHTML =
      '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px;"><div style="font-size:48px;">⚠️</div><h2>Chargement impossible</h2><p class="muted">Connectez-vous une première fois à Internet, puis rechargez la page.</p></div>';
    return;
  }
  if (!gameStore.isAccessUnlocked()) {
    show("view-access-code");
    return;
  }
  proceedAfterAccess();
}

boot();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
