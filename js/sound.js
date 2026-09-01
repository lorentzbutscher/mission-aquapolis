// Sons de l'application : effets ponctuels (fichier fourni sinon bip de
// secours) + musique de fond en boucle. Tout est piloté par un seul bouton
// muet, dont l'état est mémorisé (localStorage) et s'applique partout.
import { playSuccessJingle, playEndChime } from "./utils.js";

const MUTE_KEY = "aquapolis_muted";

const SFX_URLS = {
  success: "./assets/audio/succes.mp3",
  victory: "./assets/audio/victoire.mp3",
};
const MUSIC_URL = "./assets/audio/deversoir.mp3";
const MUSIC_VOLUME = 0.28;

const BOMBE_LOOP_URLS = {
  tick: "./assets/audio/bombe/tick_tock_loop.mp3",
  urgent: "./assets/audio/bombe/urgent_beep_loop.mp3",
  critical: "./assets/audio/bombe/critical_alarm_loop.mp3",
};
const BOMBE_ONESHOT_URLS = {
  success: "./assets/audio/bombe/defuse_success.mp3",
  fail: "./assets/audio/bombe/defuse_fail.mp3",
};
const BOMBE_LOOP_VOLUME = 0.55;
const BOMBE_CROSSFADE_MS = 400;

let musicEl = null;
let musicStarted = false;
const bombeLoopEls = {};
let bombeActiveLoopKey = null;

export function isMuted() {
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(muted) {
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  if (musicEl) musicEl.muted = muted;
  Object.values(bombeLoopEls).forEach((el) => (el.muted = muted));
}

export function toggleMuted() {
  setMuted(!isMuted());
  return isMuted();
}

// ---- Effets sonores ------------------------------------------------------

function playWithFallback(url, fallbackFn) {
  if (isMuted()) return;
  let fellBack = false;
  const runFallback = () => {
    if (fellBack) return;
    fellBack = true;
    fallbackFn();
  };
  try {
    const audio = new Audio(url);
    audio.volume = 0.85;
    audio.addEventListener("error", runFallback, { once: true });
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(runFallback);
  } catch {
    runFallback();
  }
}

export function playSuccessSound() {
  playWithFallback(SFX_URLS.success, playSuccessJingle);
}

export function playVictorySound() {
  playWithFallback(SFX_URLS.victory, playEndChime);
}

// ---- Musique de fond -------------------------------------------------------

function getMusicEl() {
  if (!musicEl) {
    musicEl = new Audio(MUSIC_URL);
    musicEl.loop = true;
    musicEl.volume = MUSIC_VOLUME;
    musicEl.muted = isMuted();
    musicEl.preload = "auto";
  }
  return musicEl;
}

export function startBackgroundMusic() {
  const el = getMusicEl();
  if (musicStarted) return;
  const attempt = el.play();
  if (attempt && typeof attempt.then === "function") {
    attempt
      .then(() => {
        musicStarted = true;
      })
      .catch(() => {
        const resume = () => {
          el.play()
            .then(() => {
              musicStarted = true;
            })
            .catch(() => {});
        };
        document.addEventListener("pointerdown", resume, { once: true });
        document.addEventListener("keydown", resume, { once: true });
      });
  }
}

// ---- Désamorçage de la bombe (Épreuve finale) -------------------------------
// 3 boucles qui s'enchaînent avec un fondu croisé simple selon le temps
// restant, + 2 sons ponctuels (succès/échec). Respecte le même bouton muet
// que le reste de l'app (voir setMuted ci-dessus).

function getBombeLoopEl(key) {
  if (!bombeLoopEls[key]) {
    const el = new Audio(BOMBE_LOOP_URLS[key]);
    el.loop = true;
    el.volume = 0;
    el.muted = isMuted();
    bombeLoopEls[key] = el;
  }
  return bombeLoopEls[key];
}

function fadeVolume(el, target, duration) {
  const start = el.volume;
  const startTime = performance.now();
  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    el.volume = start + (target - start) * t;
    if (t < 1) requestAnimationFrame(step);
    else if (target === 0) el.pause();
  }
  requestAnimationFrame(step);
}

// key: "tick" | "urgent" | "critical". Ne fait rien si cette boucle est déjà active.
export function setBombeLoop(key) {
  if (bombeActiveLoopKey === key) return;
  const prevKey = bombeActiveLoopKey;
  bombeActiveLoopKey = key;
  const nextEl = getBombeLoopEl(key);
  nextEl.muted = isMuted();
  nextEl.currentTime = 0;
  nextEl.play().catch(() => {});
  fadeVolume(nextEl, BOMBE_LOOP_VOLUME, BOMBE_CROSSFADE_MS);
  if (prevKey && bombeLoopEls[prevKey]) fadeVolume(bombeLoopEls[prevKey], 0, BOMBE_CROSSFADE_MS);
}

// Coupe toutes les boucles (désamorçage réussi, game over, ou abandon de partie).
export function stopBombeLoops() {
  Object.values(bombeLoopEls).forEach((el) => el.pause());
  bombeActiveLoopKey = null;
}

export function playBombeSuccess() {
  if (isMuted()) return;
  new Audio(BOMBE_ONESHOT_URLS.success).play().catch(() => {});
}

export function playBombeFail() {
  if (isMuted()) return;
  new Audio(BOMBE_ONESHOT_URLS.fail).play().catch(() => {});
}

// Sourdine légère de la musique de fond pendant le désamorçage, pour ne pas
// couvrir les boucles de tension (pas d'arrêt net, juste un volume réduit).
export function duckBackgroundMusic(duck) {
  if (musicEl) musicEl.volume = duck ? MUSIC_VOLUME * 0.15 : MUSIC_VOLUME;
}

// ---- Bouton muet, partagé sur toutes les pages ------------------------------

export function initSoundToggle() {
  let btn = document.getElementById("btn-sound-toggle");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "btn-sound-toggle";
    btn.className = "sound-toggle";
    btn.title = "Activer ou couper le son";
    btn.setAttribute("aria-label", "Activer ou couper le son");
    document.body.appendChild(btn);
  }
  const refresh = () => {
    btn.textContent = isMuted() ? "🔇" : "🔊";
  };
  btn.addEventListener("click", () => {
    toggleMuted();
    refresh();
  });
  refresh();
}
