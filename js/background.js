// Fond d'écran aléatoire : tire une des 4 images ci-dessous au hasard à
// chaque changement d'écran principal (voir l'appel dans show(), js/app.js),
// sans répéter deux fois de suite la même image.
//
// L'overlay (dégradé d'assombrissement) et le cadrage (cover / position)
// restent exactement ceux définis sur body::before dans css/style.css —
// seule l'image change, via la variable CSS --current-bg. Rien n'est
// dupliqué : ce module est le seul point qui pilote le fond.

// Chemins absolus (depuis la racine du site) : la variable CSS est consommée
// par css/style.css, donc un chemin relatif ("./assets/...") s'y résoudrait
// par rapport au dossier css/ et non à la racine — d'où /assets/... ici.
const BACKGROUNDS = [
  "/assets/backgrounds/villain_toxic_vert.jpg",
  "/assets/backgrounds/villain_orage_violet.jpg",
  "/assets/backgrounds/duel_vnf_coucher.jpg",
  "/assets/backgrounds/villain_pluie_bleu.jpg",
];

let lastIndex = -1;

function pickIndex() {
  if (BACKGROUNDS.length <= 1) return 0;
  let idx = Math.floor(Math.random() * BACKGROUNDS.length);
  while (idx === lastIndex) {
    idx = Math.floor(Math.random() * BACKGROUNDS.length);
  }
  return idx;
}

export function applyRandomBackground() {
  const idx = pickIndex();
  lastIndex = idx;
  document.documentElement.style.setProperty("--current-bg", `url("${BACKGROUNDS[idx]}")`);
}
