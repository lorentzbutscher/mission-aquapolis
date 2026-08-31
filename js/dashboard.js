import { subscribeAllTeams, TEAM_COLORS, getAllTeamsContentOnce } from "./sync.js";
import { formatHMS } from "./utils.js";

const $ = (s) => document.querySelector(s);
const TEAM_LABELS = {
  bleu: "Équipe Bleue",
  rouge: "Équipe Rouge",
  jaune: "Équipe Jaune",
  vert: "Équipe Verte",
  violet: "Équipe Violette",
};
const STATUS_LABELS = {
  not_started: "Pas commencé",
  in_progress: "En cours",
  finished: "Terminé 🏆",
};
const TEAM_HEX = { bleu: "#2563eb", rouge: "#dc2626", jaune: "#eab308", vert: "#16a34a", violet: "#7c3aed" };

let teamsContent = {};
let latestStates = {};
let tickInterval = null;

function toMillis(v) {
  if (!v) return null;
  return typeof v?.toMillis === "function" ? v.toMillis() : v;
}

function render(states) {
  const grid = $("#dash-grid");
  grid.innerHTML = "";
  for (const color of TEAM_COLORS) {
    const st = states[color] || { status: "not_started" };
    const total = teamsContent[color]?.epreuves?.length || 3;
    const card = document.createElement("div");
    card.className = "dash-card";
    card.style.borderLeftColor = TEAM_HEX[color];
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <div class="team-name">${TEAM_LABELS[color]}</div>
        <span class="status-pill ${st.status || "not_started"}">${STATUS_LABELS[st.status] || st.status}</span>
      </div>
      <p class="muted" style="margin-top:8px;">Épreuve ${Math.min((st.currentEpreuveIndex || 0) + 1, total)} / ${total}</p>
      <p class="muted" id="elapsed-${color}">Temps écoulé : —</p>
    `;
    grid.appendChild(card);
  }
  restartElapsedTicker(states);
}

function restartElapsedTicker(states) {
  clearInterval(tickInterval);
  const tick = () => {
    for (const color of TEAM_COLORS) {
      const st = states[color];
      const el = document.getElementById(`elapsed-${color}`);
      if (!el) continue;
      const started = toMillis(st?.startedAt);
      if (!started) {
        el.textContent = "Temps écoulé : —";
        continue;
      }
      const end = toMillis(st?.finishedAt) || Date.now();
      el.textContent = "Temps écoulé : " + formatHMS(end - started);
    }
  };
  tick();
  tickInterval = setInterval(tick, 1000);
}

async function boot() {
  teamsContent = await getAllTeamsContentOnce();
  render({});
  subscribeAllTeams((data, err) => {
    if (err) {
      $("#status-msg").textContent = "⚠️ " + (err.message || "Impossible de se connecter au suivi en direct.");
      $("#sync-badge").className = "sync-badge offline";
      $("#sync-label").textContent = "Hors ligne";
      return;
    }
    $("#status-msg").textContent = "";
    $("#sync-badge").className = "sync-badge online";
    $("#sync-label").textContent = "En direct";
    latestStates = data;
    render(data);
  });
}

boot();
