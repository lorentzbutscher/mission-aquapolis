// ============================================================================
// Popups "mascotte" humoristiques — petites piqûres d'ambiance qui apparaissent
// ponctuellement pendant le parcours (écrans de briefing, Palais du Rhin,
// phases 4/5/6...). Composant 100% autonome :
//   - aucun import depuis app.js, la bombe, le SMS/CARING ou la validation de code
//   - aucune lecture/écriture de STATE ou de localStorage de jeu
//   - le seul lien avec le reste de l'app est la lecture (lecture seule) de
//     l'id de la vue ".view.active", pour ne jamais s'afficher pendant le
//     mini-jeu de la bombe ni sur les écrans hors mission.
//
// Activation : un seul appel, startMascotPopups(), fait depuis js/app.js dans
// startChrono() (le déclenchement du chrono global de la mission). Pour
// désactiver entièrement la fonctionnalité, mettre MASCOT_ENABLED à false
// ci-dessous, ou ne pas appeler startMascotPopups().
// ============================================================================

const MASCOT_ENABLED = true;

const MASCOT_IMG_SRC = "./assets/mascotte-whisper.png";

// Messages piochés aléatoirement (jamais deux fois de suite le même).
// Modifiable librement — un texte par ligne.
const MASCOT_MESSAGES = [
  "Psss… Déversoir a oublié son parapluie aujourd'hui. Il ne va pas être content.",
  "Vous comprenez les mails du CSP vous ?",
  "Mon rêve c'était d'être agent VNF, mon conseiller d'Orientation voulait que je travaille à RHA. J'ai préféré devenir un super villain.",
  "Mon premier n'a pas de cheveux, mon second aime vapoter, mon troisième porte des lunettes: Je suis ?.",
  "Petit conseil de héros : hydratez-vous. Sauver Strasbourg, ça creuse.",
  "Entre nous, les autres équipes ont l'air un peu perdues. Mais chut, motus.",
  "Déversoir déteste trois choses : les héros, le PSG, et les ronds-points.",
  "On me souffle que le winstub du coin fait une excellente tarte flambée. Pour après.",
  "Rappel : marcher plus vite ne rend pas le message morse plus facile à décoder.",
  "Un espion VNF a vu Déversoir chercher la sortie du Palais du Rhin pendant 10 minutes.",
  "Ce message s'autodétruira dans 5 secondes. Enfin, façon de parler.",
  "Si vous entendez « EISH », courez. Ou pas. C'est vous les héros.",
  "Psss… Saviez que EISH est une expression familière en afrique du sud ?",
  "Astuce : un bon agent VNF ne lâche jamais son équipe. Ni son parapluie.",
];

// Fenêtre d'apparition aléatoire entre deux popups (en ms).
const MIN_DELAY_MS = 45_000;
const MAX_DELAY_MS = 90_000;
const AUTO_DISMISS_MS = 10_000;

// Écrans où le popup a le droit de s'afficher. Jamais "view-bombe" (mini-jeu),
// ni les écrans hors mission (accès, sélection équipe, chargement, fin).
const ALLOWED_VIEWS = ["view-start", "view-palais", "view-phase"];

let started = false;
let scheduleTimer = null;
let dismissTimer = null;
let lastIndex = -1;
let popupEl = null;

function currentViewId() {
  return document.querySelector(".view.active")?.id || "";
}

function pickMessage() {
  if (MASCOT_MESSAGES.length <= 1) return MASCOT_MESSAGES[0] || "";
  let idx;
  do {
    idx = Math.floor(Math.random() * MASCOT_MESSAGES.length);
  } while (idx === lastIndex);
  lastIndex = idx;
  return MASCOT_MESSAGES[idx];
}

function ensurePopupEl() {
  if (popupEl) return popupEl;
  const el = document.createElement("div");
  el.className = "mascot-popup";
  el.innerHTML = `
    <img class="mascot-popup-img" src="${MASCOT_IMG_SRC}" alt="" onerror="this.style.display='none';">
    <div class="mascot-bubble">
      <button type="button" class="mascot-bubble-close" aria-label="Fermer">✕</button>
      <p class="mascot-bubble-text"></p>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector(".mascot-bubble-close").addEventListener("click", hidePopup);
  popupEl = el;
  return el;
}

function showPopup() {
  // Jamais pendant le mini-jeu de la bombe, ni hors écrans de mission : on
  // n'affiche rien cette fois-ci et on retente au prochain cycle.
  if (!ALLOWED_VIEWS.includes(currentViewId())) {
    scheduleNext();
    return;
  }
  const el = ensurePopupEl();
  el.querySelector(".mascot-bubble-text").textContent = pickMessage();
  el.classList.remove("hide");
  void el.offsetWidth; // relance l'animation même si déjà visible juste avant
  el.classList.add("show");

  clearTimeout(dismissTimer);
  dismissTimer = setTimeout(hidePopup, AUTO_DISMISS_MS);
}

function hidePopup() {
  clearTimeout(dismissTimer);
  if (popupEl) {
    popupEl.classList.remove("show");
    popupEl.classList.add("hide");
  }
  scheduleNext();
}

function scheduleNext() {
  clearTimeout(scheduleTimer);
  const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  scheduleTimer = setTimeout(showPopup, delay);
}

// Garde-fou supplémentaire : si l'écran change pendant qu'un popup est
// affiché (ex. l'équipe arme la bombe pendant les 5 secondes d'affichage),
// on le referme immédiatement pour ne jamais parasiter le mini-jeu.
function watchViewChanges() {
  const observer = new MutationObserver(() => {
    if (popupEl && popupEl.classList.contains("show") && !ALLOWED_VIEWS.includes(currentViewId())) {
      hidePopup();
    }
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true });
}

// Point d'entrée unique — idempotent (sans effet si déjà démarré ou si
// MASCOT_ENABLED vaut false).
export function startMascotPopups() {
  if (!MASCOT_ENABLED || started) return;
  started = true;
  watchViewChanges();
  scheduleNext();
}
