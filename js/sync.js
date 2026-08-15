// ============================================================================
// Couche de synchronisation Firebase — 100% optionnelle et "best effort".
// Le jeu ne doit JAMAIS attendre ou bloquer sur cette couche : toute erreur
// réseau ou de configuration est avalée silencieusement (juste un warn console).
// ============================================================================
import { firebaseConfig } from "./firebase-config.js";

export const TEAM_COLORS = ["bleu", "rouge", "jaune", "vert", "violet"];

const SDK_VERSION = "10.14.1";
const CDN = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

export const configured = !Object.values(firebaseConfig).some(
  (v) => !v || String(v).includes("REMPLACER")
);

let _modPromise = null;

function load() {
  if (!configured) return Promise.resolve(null);
  if (!_modPromise) {
    _modPromise = (async () => {
      try {
        const [{ initializeApp }, firestore, authMod] = await Promise.all([
          import(/* webpackIgnore: true */ `${CDN}/firebase-app.js`),
          import(/* webpackIgnore: true */ `${CDN}/firebase-firestore.js`),
          import(/* webpackIgnore: true */ `${CDN}/firebase-auth.js`),
        ]);
        const app = initializeApp(firebaseConfig);
        const db = firestore.getFirestore(app);
        const auth = authMod.getAuth(app);
        return { app, db, auth, firestore, authMod };
      } catch (err) {
        console.warn("[sync] Firebase indisponible, mode local uniquement.", err);
        return null;
      }
    })();
  }
  return _modPromise;
}

// ---- Jeu (chefs de brigade) --------------------------------------------

export async function pushGameState(team, state) {
  const m = await load();
  if (!m) return false;
  try {
    const ref = m.firestore.doc(m.db, "gameState", team);
    await m.firestore.setDoc(
      ref,
      { ...state, updatedAt: m.firestore.serverTimestamp() },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.warn("[sync] envoi progression échoué (hors-ligne ?)", err);
    return false;
  }
}

export async function fetchContentFromCloud() {
  const m = await load();
  if (!m) return null;
  try {
    const configRef = m.firestore.doc(m.db, "config", "event");
    const configSnap = await m.firestore.getDoc(configRef);
    const teams = {};
    for (const color of TEAM_COLORS) {
      const tRef = m.firestore.doc(m.db, "teams", color);
      const tSnap = await m.firestore.getDoc(tRef);
      if (tSnap.exists()) teams[color] = tSnap.data();
    }
    if (!configSnap.exists() && Object.keys(teams).length === 0) return null;
    return {
      config: configSnap.exists() ? configSnap.data() : undefined,
      teams,
    };
  } catch (err) {
    console.warn("[sync] récupération contenu cloud échouée", err);
    return null;
  }
}

// ---- Tableau de bord coordinateur ---------------------------------------

export function subscribeAllTeams(onData) {
  let unsub = () => {};
  let cancelled = false;
  (async () => {
    const m = await load();
    if (cancelled) return;
    if (!m) {
      onData(null, new Error("Firebase non configuré (js/firebase-config.js)."));
      return;
    }
    try {
      const col = m.firestore.collection(m.db, "gameState");
      unsub = m.firestore.onSnapshot(
        col,
        (snap) => {
          const data = {};
          snap.forEach((d) => (data[d.id] = d.data()));
          onData(data, null);
        },
        (err) => onData(null, err)
      );
    } catch (err) {
      onData(null, err);
    }
  })();
  return () => {
    cancelled = true;
    unsub();
  };
}

// ---- Admin ---------------------------------------------------------------

export async function adminLogin(email, password) {
  const m = await load();
  if (!m) throw new Error("Firebase non configuré. Vérifie js/firebase-config.js.");
  return m.authMod.signInWithEmailAndPassword(m.auth, email, password);
}

export function onAdminAuthChange(cb) {
  (async () => {
    const m = await load();
    if (!m) {
      cb(null);
      return;
    }
    m.authMod.onAuthStateChanged(m.auth, cb);
  })();
}

export async function adminLogout() {
  const m = await load();
  if (!m) return;
  await m.authMod.signOut(m.auth);
}

export async function saveTeamContent(color, teamData) {
  const m = await load();
  if (!m) throw new Error("Firebase non configuré.");
  const ref = m.firestore.doc(m.db, "teams", color);
  await m.firestore.setDoc(ref, teamData, { merge: false });
}

export async function saveEventConfig(configData) {
  const m = await load();
  if (!m) throw new Error("Firebase non configuré.");
  const ref = m.firestore.doc(m.db, "config", "event");
  await m.firestore.setDoc(ref, configData, { merge: false });
}

export async function resetTeamState(color) {
  const m = await load();
  if (!m) throw new Error("Firebase non configuré.");
  const ref = m.firestore.doc(m.db, "gameState", color);
  await m.firestore.setDoc(ref, {
    status: "not_started",
    currentEpreuveIndex: 0,
    startedAt: null,
    finishedAt: null,
    currentTrapEndsAt: null,
    attempts: 0,
    updatedAt: m.firestore.serverTimestamp(),
  });
}

export async function getAllTeamsContentOnce() {
  const m = await load();
  if (!m) return {};
  const teams = {};
  for (const color of TEAM_COLORS) {
    const tRef = m.firestore.doc(m.db, "teams", color);
    const snap = await m.firestore.getDoc(tRef);
    if (snap.exists()) teams[color] = snap.data();
  }
  return teams;
}

export async function getEventConfigOnce() {
  const m = await load();
  if (!m) return null;
  const ref = m.firestore.doc(m.db, "config", "event");
  const snap = await m.firestore.getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
