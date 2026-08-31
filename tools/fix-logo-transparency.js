const sharp = require("sharp");
const path = require("path");

const SRC = path.join(__dirname, "..", "assets", "logo-original-download.png");
const OUT = path.join(__dirname, "..", "assets", "logo.png");

// Seuils de luminosité pour la transparence : sous DARK, totalement transparent ;
// au-dessus de LIGHT, totalement opaque ; entre les deux, dégradé pour un bord propre.
const DARK = 12;
const LIGHT = 40;

(async () => {
  const img = sharp(SRC).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels = 4 (RGBA) grâce à ensureAlpha

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.max(r, g, b);
    let alpha;
    if (lum <= DARK) alpha = 0;
    else if (lum >= LIGHT) alpha = 255;
    else alpha = Math.round(((lum - DARK) / (LIGHT - DARK)) * 255);
    data[i + 3] = alpha;
  }

  await sharp(data, { raw: { width, height, channels } })
    .trim({ threshold: 10 }) // recadre sur le contenu visible (retire les marges transparentes)
    .png({ compressionLevel: 9 })
    .toFile(OUT + ".tmp");

  // Recompresser/redimensionner raisonnablement pour le web
  const fs = require("fs");
  const finalMeta = await sharp(OUT + ".tmp").metadata();
  const targetWidth = Math.min(finalMeta.width, 600);
  await sharp(OUT + ".tmp").resize({ width: targetWidth, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(OUT);
  fs.unlinkSync(OUT + ".tmp");

  const stat = fs.statSync(OUT);
  const meta = await sharp(OUT).metadata();
  console.log("logo.png ->", `${meta.width}x${meta.height}`, meta.hasAlpha ? "alpha" : "no-alpha", `${(stat.size / 1024).toFixed(0)}KB`);
})();
