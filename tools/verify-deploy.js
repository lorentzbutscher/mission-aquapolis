const BASE = "https://raw.githubusercontent.com/lorentzbutscher/mission-aquapolis/main/";

const checks = [
  { file: "manifest.json", markers: ['"display": "fullscreen"', '"display_override"'] },
  { file: "index.html", markers: ["view-access-code", "apple-mobile-web-app-status-bar-style", "page-nav", "result-map-wrap", "lightbox-modal", "morse-modal"] },
  { file: "css/style.css", markers: ["safe-area-inset-top", "audio-player", ".page-tabs", "lightbox", "morse-table"] },
  { file: "js/app.js", markers: ["ACCESS_CODE", "totalEpreuvesForTeam", "MORSE_MAP", "openLightbox", "renderResultMap"] },
  { file: "js/admin.js", markers: ["FINAL_KEY", "renderPageTabs", "saveFinalPanel", 'case "audio"', "audio-file-input"] },
  { file: "js/sync.js", markers: ["saveFinalEpreuve", "getFinalEpreuveOnce"] },
  { file: "js/content.js", markers: ["finalEpreuve"] },
  { file: "js/state.js", markers: ["currentPageIndex", "isAccessUnlocked", "setAccessUnlocked"] },
  { file: "admin.html", markers: ["__final__"] },
  { file: "service-worker.js", markers: ["aquapolis-v11"] },
  { file: "content.json", markers: ['"pages"', '"finalEpreuve"'] },
];

(async () => {
  for (const { file, markers } of checks) {
    try {
      const res = await fetch(BASE + file, { cache: "no-store" });
      const text = await res.text();
      const results = markers.map((m) => `${text.includes(m) ? "✅" : "❌"} ${m}`);
      console.log(`\n${file} (HTTP ${res.status}, ${text.length} octets)`);
      results.forEach((r) => console.log("  " + r));
    } catch (err) {
      console.log(`\n${file} -> ERREUR: ${err.message}`);
    }
  }
})();
