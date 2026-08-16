const STORAGE_PREFIX = "aquapolis_state_";
const TEAM_KEY = "aquapolis_selected_team";

export function defaultState() {
  return {
    status: "not_started", // not_started | in_progress | trap | finished
    currentEpreuveIndex: 0,
    startedAt: null,
    finishedAt: null,
    currentTrapEndsAt: null,
    wrongAttempts: 0,
    // Un tableau d'identifiants de blocs "indice" révélés, par épreuve
    // (ex. revealedBlocks[0] = ["blk_2"] pour l'épreuve 1).
    revealedBlocks: [[], [], []],
    trapCount: 0,
  };
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
