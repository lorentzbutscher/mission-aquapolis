// Service worker — mode hors-ligne pour Mission Aquapolis.
// Stratégie :
//   - app shell (HTML/JS/CSS/JSON, même origine) en RÉSEAU D'ABORD : le
//     téléphone récupère systématiquement la dernière version tant qu'il a du
//     réseau, la copie en cache n'étant utilisée que si la requête échoue
//     (vraiment hors-ligne). Avant ce changement, l'app shell était en
//     cache-first : un téléphone déjà installé pouvait rester bloqué sur une
//     ancienne version (contenu admin périmé, correctifs jamais reçus) tant
//     qu'aucune mise à jour de service worker n'avait fini de se propager —
//     ce qui, sur PWA installée, peut prendre bien plus qu'un simple
//     rechargement. Le réseau d'abord supprime ce risque : toute publication
//     admin est visible dès la requête suivante, sans dépendre du cycle de
//     vie du service worker.
//   - tuiles de carte et gros médias (images/audio/police) restent en
//     cache-first / stale-while-revalidate : ils ne changent quasiment
//     jamais, et privilégier le cache économise de la donnée mobile sur le
//     terrain.
//   - les appels Firebase/Firestore ne sont JAMAIS interceptés (on laisse le
//     réseau natif gérer, sync.js gère déjà les échecs proprement).

const CACHE_VERSION = "aquapolis-v39";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./content.json",
  "./css/style.css",
  "./css/aquapolis-ameliorations.css",
  "./css/mascot.css",
  "./js/app.js",
  "./js/app-narratif.js",
  "./js/content.js",
  "./js/state.js",
  "./js/sync.js",
  "./js/map.js",
  "./js/utils.js",
  "./js/firebase-config.js",
  "./js/background.js",
  "./js/mascot.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./assets/logo.png",
  "./assets/vnf_mystere_badge.png",
  "./assets/fonts/Sketcomic.otf",
  "./assets/background.webp",
  "./assets/backgrounds/villain_toxic_vert.jpg",
  "./assets/backgrounds/villain_orage_violet.jpg",
  "./assets/backgrounds/duel_vnf_coucher.jpg",
  "./assets/backgrounds/villain_pluie_bleu.jpg",
  "./assets/flags/flag_suisse.png",
  "./assets/flags/flag_france.png",
  "./assets/flags/flag_belgique.png",
  "./assets/flags/flag_allemagne.png",
  "./assets/flags/flag_pays_bas.png",
  "./assets/villain.png",
  "./assets/mascotte-whisper.png",
  "./assets/mission-end/semeh-2026-banniere.png",
  "./assets/mission-end/deversoir-fuite.png",
  "./assets/mission-end/note-hydra-louise.png",
  "./assets/bombe-epreuve-finale.jpg",
  "./assets/audio/bombe/tick_tock_loop.mp3",
  "./assets/audio/bombe/urgent_beep_loop.mp3",
  "./assets/audio/bombe/critical_alarm_loop.mp3",
  "./assets/audio/bombe/defuse_success.mp3",
  "./assets/audio/bombe/defuse_fail.mp3",
  "./assets/audio/morse_zix.m4a",
  "./assets/audio/deversoir.mp3",
  "./assets/team-buttons/bleu.webp",
  "./assets/team-buttons/rouge.webp",
  "./assets/team-buttons/jaune.webp",
  "./assets/team-buttons/vert.webp",
  "./assets/team-buttons/violet.webp",
  "./assets/audio/succes.mp3",
  "./assets/audio/victoire.mp3",
  "./js/sound.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            await cache.add(url);
          } catch (err) {
            console.warn("[sw] échec mise en cache initiale", url, err);
          }
        })
      );
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const TILE_HOSTS = ["tile.openstreetmap.org"];
// Uniquement les appels d'API Firebase (Firestore/Auth) : jamais interceptés,
// on laisse le réseau natif gérer. Les images Firebase Storage, elles,
// passent par le cache normal plus bas (staleWhileRevalidate) pour rester
// disponibles hors-ligne.
const BYPASS_HOSTS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebaseio.com",
];

// Extensions/chemins de l'app shell : toujours tentés en réseau d'abord. Tout
// le reste (assets lourds, tuiles) passe par les stratégies cache-first /
// stale-while-revalidate ci-dessous, inchangées.
const NETWORK_FIRST_EXT = [".html", ".js", ".css", ".json"];

function isAppShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === "/" || url.pathname.endsWith("/")) return true;
  return NETWORK_FIRST_EXT.some((ext) => url.pathname.endsWith(ext));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (BYPASS_HOSTS.some((h) => url.hostname.endsWith(h))) return; // laisser passer nativement

  if (isAppShellRequest(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

function isCacheable(res) {
  return res && (res.status === 200 || res.type === "opaque");
}

// Réseau d'abord : la version la plus récente gagne toujours tant qu'il y a
// du réseau. Le cache ne sert que de secours hors-ligne, et est rafraîchi à
// chaque succès réseau pour rester utile quand la connexion coupe.
async function networkFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (isCacheable(res)) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response("Hors-ligne", { status: 503 });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (isCacheable(res)) cache.put(req, res.clone());
    return res;
  } catch {
    return cached || new Response("", { status: 504 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (isCacheable(res)) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await networkPromise) || new Response("Hors-ligne", { status: 503 });
}
