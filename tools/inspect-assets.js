const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const dir = "C:/Users/loren/Downloads";
const files = [
  "background.webp",
  "bouton_les_gardiens_du_courant_transparent.png",
  "bouton_les_barrages_ecarlates.png",
  "bouton_les_fulgures_hydrauliques.png",
  "bouton_les_sentinelles_du_canal_transparent.png",
  "bouton_les_vigies_des_voies_navigables.png",
];

(async () => {
  for (const f of files) {
    const p = path.join(dir, f);
    const meta = await sharp(p).metadata();
    const size = (fs.statSync(p).size / 1024).toFixed(0);
    console.log(f, "->", `${meta.width}x${meta.height}`, meta.format, meta.hasAlpha ? "alpha" : "no-alpha", `${size}KB`);
  }
})();
