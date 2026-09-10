const STORAGE_PREFIX = "aquapolis_state_";
const TEAM_KEY = "aquapolis_selected_team";
const ACCESS_KEY = "aquapolis_access_unlocked";

export function defaultState() {
  return {
    status: "not_started", // not_started | in_progress | finished
    // Déroulé verrouillé en 7 phases (identique pour les 5 équipes) :
    //   0 → phase 2 (CCNR, Palais p.1)      3 → phase 5 (CARING)
    //   1 → phase 3 (drapeau, Palais p.2/3) 4 → phase 6 (ZIX → bombe)
    //   2 → phase 4 (1796, Kléber)          5 → mini-jeu bombe (SEMEH)
    //                                       6 → écran de fin (phase 7)
    // phaseIndex = nombre de portes de code déjà franchies. Une phase reste
    // verrouillée tant que la précédente n'est pas validée.
    phaseIndex: 0,
    lastCode: "", // dernier code validé (info ; pas de re-vérification au rechargement)
    // Anciens champs du moteur "épreuves numérotées" — conservés pour
    // compatibilité de lecture d'anciens états, mais le flow ne les utilise plus.
    currentEpreuveIndex: 0,
    currentPageIndex: 0,
    startedAt: null,
    finishedAt: null,
    revealedBlocks: [],
    // Sous-état interne du Palais du Rhin (phases 2-3) : quelle sous-page afficher.
    palais: {
      pageIndex: 0,
      codeOk: false,
      flagOk: false,
      done: false,
    },
    // Mini-jeu de désamorçage (Épreuve finale). `armedAt`/`endsAt` permettent de
    // recalculer le temps restant à tout moment (persiste au rechargement, y
    // compris l'état "game over"). `frozenRemainMs` fige l'affichage du minuteur
    // une fois désamorcée.
    bombe: {
      armedAt: null,
      endsAt: null,
      defused: false,
      gameOver: false,
      frozenRemainMs: null,
    },
  };
}

export function isAccessUnlocked() {
  return localStorage.getItem(ACCESS_KEY) === "1";
}

export function setAccessUnlocked() {
  localStorage.setItem(ACCESS_KEY, "1");
}

export function getSelectedTeam() {
  return localStorage.getItem(TEAM_KEY);
}

export function setSelectedTeam(color) {
  localStorage.setItem(TEAM_KEY, color);
}

export function clearSelectedTeam() {
  localStorage.removeItem(TEAM_KEY);
}

export function getState(color) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + color);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

export function saveState(color, state) {
  localStorage.setItem(STORAGE_PREFIX + color, JSON.stringify(state));
}

export function resetState(color) {
  localStorage.removeItem(STORAGE_PREFIX + color);
}
