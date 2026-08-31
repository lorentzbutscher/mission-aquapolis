const STORAGE_PREFIX = "aquapolis_state_";
const TEAM_KEY = "aquapolis_selected_team";
const ACCESS_KEY = "aquapolis_access_unlocked";

export function defaultState() {
  return {
    status: "not_started", // not_started | in_progress | finished
    currentEpreuveIndex: 0,
    currentPageIndex: 0,
    startedAt: null,
    finishedAt: null,
    // Un tableau d'identifiants de blocs "indice" révélés, par épreuve
    // (ex. revealedBlocks[0] = ["blk_2"] pour l'épreuve 1). Rempli à la volée,
    // sa taille n'est pas fixée d'avance (le nombre d'épreuves varie par équipe).
    revealedBlocks: [],
    // Séquence "Palais du Rhin" : prologue joué juste après le choix d'équipe,
    // avant la première épreuve. `done` passe à true une fois la page 3 validée.
    palais: {
      pageIndex: 0,
      codeOk: false,
      flagOk: false,
      done: false,
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
