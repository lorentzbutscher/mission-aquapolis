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

let musicEl = null;
let musicStarted = false;

export function isMuted() {
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(muted) {
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  if (musicEl) musicEl.muted = muted;
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
