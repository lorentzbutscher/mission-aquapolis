// Migration : blocks plats -> pages[].blocks, ajout épreuve finale partagée,
// ajout d'une 4e épreuve de test pour Jaune (5 au total avec la finale).
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "content.json");
const content = JSON.parse(fs.readFileSync(FILE, "utf8"));

let blockCounter = 1000;
function nextId() {
  return "blk_" + ++blockCounter;
}

function migrateEpreuve(ep) {
  if (ep.pages) return ep; // déjà migré
  const { blocks, ...rest } = ep;
  return { ...rest, pages: [{ blocks: blocks || [] }] };
}

for (const color of Object.keys(content.teams)) {
  content.teams[color].epreuves = content.teams[color].epreuves.map(migrateEpreuve);
}

// Jaune : 4 épreuves régulières (au lieu de 3) + l'épreuve finale partagée en plus
const jaune = content.teams.jaune;
jaune.epreuves.push({
  titre: "Épreuve 4",
  lieu: { lat: 48.5798, lng: 7.7448 },
  code: { valeur: "2026", essaisAvantPiege: 2 },
  piege: { texte: "Piège ! Une fausse indication vous a ralentis.", dureeMinutes: 2 },
  revelation: { texte: "Révélation (test) : direction l'épreuve finale !" },
  pages: [
    {
      blocks: [
        {
          id: nextId(),
          type: "texte",
          visible: true,
          html: "<p><strong>Lieu de test C4</strong></p><p>Dernière étape avant l'épreuve finale commune.</p><p>📍 Place Saint-Thomas, Strasbourg</p>",
        },
        { id: nextId(), type: "indice", visible: true, texte: "Indice bonus : observez la date sur le fronton." },
      ],
    },
  ],
});

// Épreuve finale partagée par les 5 équipes
content.finalEpreuve = {
  titre: "Épreuve finale",
  lieu: { lat: 48.5798, lng: 7.7422 },
  code: { valeur: "ZIX", essaisAvantPiege: 3 },
  piege: { texte: "Piège ! Une fausse indication vous a ralentis.", dureeMinutes: 2 },
  revelation: { texte: "Révélation (test) : Bravo ! Rendez-vous Place Benjamin Zix pour la photo de groupe !" },
  pages: [
    {
      blocks: [
        {
          id: nextId(),
          type: "texte",
          visible: true,
          html: "<p><strong>Épreuve finale</strong></p><p>Un dernier message crypté vous parvient en morse. Écoutez-le et décodez le lieu de rassemblement.</p>",
        },
        {
          id: nextId(),
          type: "audio",
          visible: true,
          url: "",
          label: "Message codé",
        },
      ],
    },
    {
      blocks: [
        {
          id: nextId(),
          type: "texte",
          visible: true,
          html: "<p>Une fois le message décodé, saisissez le code ci-dessous.</p>",
        },
      ],
    },
  ],
};

fs.writeFileSync(FILE, JSON.stringify(content, null, 2) + "\n");
console.log("Migration terminée.");
console.log("Jaune : " + jaune.epreuves.length + " épreuves régulières + 1 finale");
console.log(
  "Autres équipes : " +
    content.teams.bleu.epreuves.length +
    " épreuves régulières + 1 finale"
);
