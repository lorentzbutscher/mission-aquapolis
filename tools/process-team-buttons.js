const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const DL = "C:/Users/loren/Downloads";
const OUT_BTN = path.join(__dirname, "..", "assets", "team-buttons");
const OUT_ASSETS = path.join(__dirname, "..", "assets");

fs.mkdirSync(OUT_BTN, { recursive: true });

const buttons = [
  { color: "bleu", file: "bouton_les_gardiens_du_courant_transparent.png" },
  { color: "rouge", file: "bouton_les_barrages_ecarlates.png" },
  { color: "jaune", file: "bouton_les_fulgures_hydrauliques.png" },
  { color: "vert", file: "bouton_les_sentinelles_du_canal_transparent.png" },
  { color: "violet", file: "bouton_les_vigies_des_voies_navigables.png" },
];

(async () => {
  // Fond d'écran
  const bgIn = path.join(DL, "background.webp");
  const bgOut = path.join(OUT_ASSETS, "background.webp");
  await sharp(bgIn).resize({ width: 900, withoutEnlargement: true }).webp({ quality: 75 }).toFile(bgOut + ".tmp");
  fs.renameSync(bgOut + ".tmp", bgOut);
  const bgStat = fs.statSync(bgOut);
  const bgMeta = await sharp(bgOut).metadata();
  console.log("background.webp ->", `${bgMeta.width}x${bgMeta.height}`, `${(bgStat.size / 1024).toFixed(0)}KB`);

  // Boutons d'équipe
  for (const { color, file } of buttons) {
    const inPath = path.join(DL, file);
    const outPath = path.join(OUT_BTN, `${color}.webp`);
    const meta = await sharp(inPath).metadata();
    const targetWidth = Math.min(meta.width, 800);
    await sharp(inPath)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: 92, alphaQuality: 100 })
      .toFile(outPath);
    const outMeta = await sharp(outPath).metadata();
    const outStat = fs.statSync(outPath);
    console.log(
      `${color}.webp <- ${file} :: ${meta.width}x${meta.height} -> ${outMeta.width}x${outMeta.height}, ${(outStat.size / 1024).toFixed(0)}KB`
    );
  }
})();
