// ============================================================================
// app-narratif.js — couche narrative additive
//
// PRINCIPE : ce fichier n'enlève rien et ne remplace rien. js/app.js garde la
// main sur tout le déroulé, les 7 phases, les codes, la bombe, Firebase et la
// persistance. Ce script écoute le DOM déjà rendu et ajoute par-dessus :
//
//   1. la jauge de crue (le temps qui monte, en plus du chronomètre)
//   2. l'expéditeur de chaque texte (Centrale VNF / Déversoir)
//   3. le sas de transmission entre deux phases
//   4. le dossier de preuves (7 pièces, dérivé de phaseIndex)
//   5. l'afficheur déporté du boîtier, lisible
//
// Retirer la balise <script> dans index.html suffit à revenir exactement à
// l'état actuel du jeu. Aucune donnée n'est écrite dans localStorage sauf une
// clé propre au script (aq_narr_seen) pour ne pas rejouer un sas déjà vu.
// ============================================================================

const STORAGE_PREFIX = "aquapolis_state_";
const TEAM_KEY = "aquapolis_selected_team";
const SEEN_KEY = "aq_narr_seen";

// --- Les 7 pièces du dossier, une par phase franchie -----------------------
// L'ordre suit phaseIndex : 0 = aucune pièce, 7 = dossier complet.
const PIECES = [
  { n: "01", nom: "Relevé CCNR", sous: "Palais du Rhin" },
  { n: "02", nom: "Drapeau intrus", sous: "Palais du Rhin" },
  { n: "03", nom: "Date du Sphinx", sous: "Place Kléber" },
  { n: "04", nom: "SMS intercepté", sous: "Relais nord" },
  { n: "05", nom: "Bande morse", sous: "Quai Saint-Thomas" },
  { n: "06", nom: "Boîtier désamorcé", sous: "Écluse" },
  { n: "07", nom: "Écluse verrouillée", sous: "Mission accomplie" },
];

const VOICES = {
  vnf: { nom: "Centrale VNF", role: "Votre allié sur le réseau", cls: "aq-v-vnf", img: "./assets/vnf_mystere_badge.png" },
  dev: { nom: "Déversoir", role: "Il vous écoute depuis le début", cls: "aq-v-dev", img: "./assets/villain.png" },
};

const $ = (s, r = document) => r.querySelector(s);

function team() { return localStorage.getItem(TEAM_KEY); }

function phaseIndex() {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + team());
    return raw ? (JSON.parse(raw).phaseIndex || 0) : 0;
  } catch { return 0; }
}

function seen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; }
}
function markSeen(k) {
  const s = seen();
  if (!s.includes(k)) { s.push(k); localStorage.setItem(SEEN_KEY, JSON.stringify(s)); }
}

// ============================================================ 1. jauge de crue
// Lit le chronomètre déjà affiché par app.js — aucun minuteur parallèle, donc
// aucun risque de désynchronisation.

function parseHMS(t) {
  const p = (t || "").trim().split(":").map(Number);
  if (p.length === 3 && p.every((n) => !isNaN(n))) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2 && p.every((n) => !isNaN(n))) return p[0] * 60 + p[1];
  return null;
}

function buildCrue() {
  if ($("#aq-crue")) return;
  // Surtout pas dans #chrono-wrap : app.js le réécrit chaque seconde, la jauge
  // serait effacée puis recréée en boucle (clignotement).
  const el = document.createElement("div");
  el.id = "aq-crue";
  el.innerHTML =
    '<div class="aq-crue-label">Niveau<br />de la crue</div>' +
    '<div class="aq-crue-tube"><div class="aq-crue-fill"></div></div>';
  document.body.appendChild(el);

  const veil = document.createElement("div");
  veil.id = "aq-crue-veil";
  veil.innerHTML = '<div class="aq-crue-water"></div>';
  document.body.appendChild(veil);
}

function updateCrue() {
  const el = $("#aq-crue");
  const veil = $("#aq-crue-veil");
  const times = document.querySelectorAll("#chrono-wrap .chrono-time");
  if (times.length < 2) {
    if (el && el.style.display !== "none") el.style.display = "none";
    if (veil && veil.style.display !== "none") veil.style.display = "none";
    return;
  }
  if (el && el.style.display === "none") el.style.display = "";
  if (veil && veil.style.display === "none") veil.style.display = "";
  const elapsed = parseHMS(times[0].textContent);
  const target = parseHMS(times[1].textContent);
  if (elapsed == null || !target) return;
  const pct = Math.min(92, Math.max(4, Math.round((elapsed / target) * 100)));
  const color = pct > 75 ? "#f87171" : pct > 50 ? "#ffd12e" : "#7dd3fc";
  const fill = $(".aq-crue-fill");
  const water = $(".aq-crue-water");
  const h = pct + "%";
  if (fill && fill.style.height !== h) { fill.style.height = h; fill.style.background = color; }
  const wh = Math.round(pct * 0.42) + "%";
  if (water && water.style.height !== wh) water.style.height = wh;
}

// ========================================================== 2. l'expéditeur
// Convention éditoriale, réglable depuis l'admin sans toucher à son code :
// un bloc texte qui commence par [[DEVERSOIR]] ou [[VNF]] reçoit le badge
// correspondant, la marque est retirée de l'affichage. Sans marque, les textes
// « avant » sont attribués à la Centrale et les « après » (révélation) aussi ;
// les répliques entre guillemets français sont attribuées à Déversoir.

function detectVoice(el) {
  const t = (el.textContent || "").trim();
  if (/^\[\[\s*DEVERSOIR\s*\]\]/i.test(t)) return "dev";
  if (/^\[\[\s*VNF\s*\]\]/i.test(t)) return "vnf";
  if (/^[«"]/.test(t)) return "dev";
  return "vnf";
}

function stripMark(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const before = n.nodeValue;
    const after = before.replace(/\[\[\s*(DEVERSOIR|VNF)\s*\]\]\s*/i, "");
    if (after !== before) { n.nodeValue = after; return; }
  }
}

function tagVoices() {
  document.querySelectorAll("#phase-avant, #phase-apres-text, #view-epreuve .block-texte")
    .forEach((el) => {
      if (el.dataset.aqVoice) return;
      if (!(el.textContent || "").trim()) return;
      const key = detectVoice(el);
      el.dataset.aqVoice = key;
      stripMark(el);
      const v = VOICES[key];
      const head = document.createElement("div");
      head.className = "aq-voice " + v.cls;
      head.innerHTML =
        '<img src="' + v.img + '" alt="" />' +
        '<span><b>' + v.nom + '</b><i>' + v.role + '</i></span>';
      el.classList.add("aq-voiced", v.cls);
      el.insertBefore(head, el.firstChild);
    });
}

// =================================================== 3. sas de transmission
// Un voile par-dessus la vue, jamais à la place. Fermé, la phase est là,
// intacte. Ne s'affiche qu'une fois par phase.

function maybeSas() {
  const view = $("#view-phase");
  if (!view || !view.classList.contains("active")) return;
  const src = $("#phase-avant");
  if (!src || !(src.textContent || "").trim()) return;

  const key = "sas-" + phaseIndex();
  if (seen().includes(key) || $("#aq-sas")) return;

  const voice = VOICES[src.dataset.aqVoice || "vnf"];
  const titre = ($("#phase-title") || {}).textContent || "";
  const texte = src.cloneNode(true);
  texte.querySelectorAll(".aq-voice").forEach((n) => n.remove());

  const sas = document.createElement("div");
  sas.id = "aq-sas";
  sas.className = voice.cls;
  sas.innerHTML =
    '<div class="aq-sas-inner">' +
      '<img class="aq-sas-face" src="' + voice.img + '" alt="" />' +
      '<div class="aq-sas-kicker">Transmission entrante</div>' +
      '<div class="aq-sas-name">' + voice.nom + '</div>' +
      '<div class="aq-sas-body"></div>' +
      '<button type="button" class="aq-sas-btn">Ouvrir ' + (titre || "l\'étape") + '</button>' +
    '</div>';
  sas.querySelector(".aq-sas-body").appendChild(texte);
  document.body.appendChild(sas);

  const close = () => { markSeen(key); sas.remove(); };
  sas.querySelector(".aq-sas-btn").addEventListener("click", close);
  sas.addEventListener("click", (e) => { if (e.target === sas) close(); });
}

// ======================================================== 4. dossier de preuves

function buildDossier() {
  if ($("#aq-dossier-btn")) return;
  const btn = document.createElement("button");
  btn.id = "aq-dossier-btn";
  btn.type = "button";
  btn.addEventListener("click", openDossier);
  document.body.appendChild(btn);
  updateDossierBtn();
}

function updateDossierBtn() {
  const btn = $("#aq-dossier-btn");
  if (!btn) return;
  const n = Math.min(7, phaseIndex());
  const label = "Dossier — " + n + "/7 pièces";
  if (btn.textContent !== label) btn.textContent = label;
  const playing = ["view-phase", "view-epreuve", "view-palais", "view-bombe", "view-mission-end"]
    .some((id) => { const v = document.getElementById(id); return v && v.classList.contains("active"); });
  const disp = playing ? "" : "none";
  if (btn.style.display !== disp) btn.style.display = disp;
}

function openDossier() {
  if ($("#aq-dossier")) return;
  const n = Math.min(7, phaseIndex());
  const ov = document.createElement("div");
  ov.id = "aq-dossier";
  ov.innerHTML =
    '<div class="aq-dossier-panel">' +
      '<h2>Dossier Déversoir</h2>' +
      '<p class="aq-dossier-count">' +
        (n === 0 ? "Aucune pièce réunie. Chaque code validé en ajoute une."
                 : n + " pièce" + (n > 1 ? "s" : "") + " sur 7 réunie" + (n > 1 ? "s" : "")) +
      '</p>' +
      '<ul>' + PIECES.map((p, i) => {
        const got = i < n;
        return '<li class="' + (got ? "got" : "") + '"><span class="aq-piece-n">' + p.n + '</span>' +
               '<span class="aq-piece-t"><b>' + (got ? p.nom : "— — —") + '</b>' +
               '<i>' + (got ? p.sous : "Pièce non trouvée") + '</i></span></li>';
      }).join("") + '</ul>' +
      '<button type="button" class="aq-dossier-close">Retour à la mission</button>' +
    '</div>';
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector(".aq-dossier-close").addEventListener("click", close);
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
}

// ================================================= 5. afficheur du boîtier
// Miroir de #bombe-lcd et #bombe-led. L'image du décor et son afficheur de 9 px
// restent en place ; celui-ci les répète en grand au-dessus du clavier.

function buildBombe() {
  const keypad = $("#bombe-keypad");
  const lcd = $("#bombe-lcd");
  const led = $("#bombe-led");
  if (!keypad || !lcd || !led || $("#aq-bombe-hud")) return;

  const hud = document.createElement("div");
  hud.id = "aq-bombe-hud";
  hud.innerHTML =
    '<div><span class="aq-bh-label">Code saisi</span><span class="aq-bh-code"></span></div>' +
    '<div class="aq-bh-right"><span class="aq-bh-label">Restant</span><span class="aq-bh-time"></span></div>';
  keypad.parentNode.insertBefore(hud, keypad);

  const cEl = hud.querySelector(".aq-bh-code");
  const tEl = hud.querySelector(".aq-bh-time");
  const sync = () => {
    if (cEl.textContent !== lcd.textContent) cEl.textContent = lcd.textContent;
    if (tEl.textContent !== led.textContent) tEl.textContent = led.textContent;
  };
  sync();
  new MutationObserver(sync).observe(lcd, { childList: true, characterData: true, subtree: true });
  new MutationObserver(sync).observe(led, { childList: true, characterData: true, subtree: true });
}

// ---------------------------------------------------------------- boucle

// tick() modifie le DOM. L'observateur est donc débranché pendant son exécution
// et les appels sont temporisés : sans cela, chaque modification relancerait
// tick(), qui modifierait à nouveau le DOM — boucle infinie, page figée.
let observer = null;
let running = false;
let pending = null;

function tick() {
  if (running) return;
  running = true;
  if (observer) observer.disconnect();
  try {
    buildCrue();
    updateCrue();
    tagVoices();
    buildDossier();
    updateDossierBtn();
    buildBombe();
    maybeSas();
  } catch (err) {
    console.error("[narratif]", err);
  } finally {
    if (observer) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
    running = false;
  }
}

function scheduleTick() {
  if (running || pending) return;
  pending = setTimeout(() => { pending = null; tick(); }, 250);
}

function start() {
  console.log("[narratif] couche narrative active");
  document.body.dataset.aqNarr = "on";
  observer = new MutationObserver(scheduleTick);
  tick();
  setInterval(tick, 900);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
