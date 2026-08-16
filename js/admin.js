import {
  adminLogin,
  onAdminAuthChange,
  adminLogout,
  getAllTeamsContentOnce,
  getEventConfigOnce,
  saveTeamContent,
  saveEventConfig,
  resetTeamState,
  uploadBlockImage,
  configured,
  TEAM_COLORS,
} from "./sync.js";
import { createMap, addCustomMarker } from "./map.js";

const $ = (s) => document.querySelector(s);
const TEAM_LABELS = { bleu: "Bleue", rouge: "Rouge", jaune: "Jaune", vert: "Verte", violet: "Violette" };

let TEAMS_DATA = {};
let CONFIG_DATA = {};
let cfgMap = null;
let cfgMarker = null;
const epMaps = {};
const activeEpIdx = {};

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function flash(msg, isError = false) {
  let el = document.getElementById("admin-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "admin-toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = isError ? "#7f1d1d" : "rgba(20,20,20,.92)";
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3000);
}

function emptyEpreuve(n) {
  return {
    titre: `Épreuve ${n}`,
    lieu: { lat: 48.5836, lng: 7.7458 },
    code: { valeur: "", essaisAvantPiege: 2 },
    piege: { texte: "", dureeMinutes: 2 },
    revelation: { texte: "" },
    blocks: [],
  };
}

// ---- Blocs de contenu -----------------------------------------------------

function blockTypeMeta(type) {
  return (
    {
      texte: { icon: "📝", label: "Texte" },
      photo: { icon: "📷", label: "Photo" },
      video: { icon: "🎬", label: "Vidéo" },
      carte: { icon: "🗺️", label: "Carte" },
      indice: { icon: "💡", label: "Indice" },
    }[type] || { icon: "❓", label: type }
  );
}

function newBlockId() {
  return "blk_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function blockDefaults(type) {
  const base = { id: newBlockId(), type, visible: true };
  switch (type) {
    case "texte":
      return { ...base, html: "<p>Nouveau texte…</p>" };
    case "photo":
      return { ...base, url: "", caption: "" };
    case "video":
      return { ...base, url: "", youtubeId: "" };
    case "carte":
      return { ...base, url: "", label: "Voir l'itinéraire" };
    case "indice":
      return { ...base, texte: "" };
    default:
      return base;
  }
}

function parseYouTubeId(url) {
  if (!url) return "";
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/,
    /youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return "";
}

function emptyTeam(color) {
  return {
    label: `Équipe ${TEAM_LABELS[color]}`,
    heroName: "",
    epreuves: [emptyEpreuve(1), emptyEpreuve(2), emptyEpreuve(3)],
  };
}

function defaultConfig() {
  return {
    eventName: "Mission Aquapolis",
    eventDate: "2026-09-17",
    durationMinutes: 120,
    maxDurationMinutes: 150,
    convergence: {
      name: "Place Benjamin Zix",
      detail: "Secteur Ponts Couverts / Maison des Tanneurs",
      lat: 48.5798,
      lng: 7.7422,
      time: "16:30",
    },
  };
}

// ---- Authentification ------------------------------------------------------

if (!configured) {
  $("#login-error").textContent =
    "Firebase n'est pas configuré (js/firebase-config.js). Voir le guide de déploiement.";
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#admin-email").value.trim();
  const pw = $("#admin-password").value;
  $("#login-error").textContent = "";
  try {
    await adminLogin(email, pw);
  } catch (err) {
    $("#login-error").textContent = "Connexion impossible : " + friendlyAuthError(err);
  }
});

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "email ou mot de passe incorrect.";
  if (code.includes("network")) return "problème réseau, réessayez.";
  return err.message || "erreur inconnue.";
}

$("#btn-logout").addEventListener("click", () => adminLogout());

onAdminAuthChange(async (user) => {
  if (user) {
    $("#login-screen").style.display = "none";
    $("#admin-screen").style.display = "block";
    await loadAllData();
    renderGeneral();
    renderTeamPanels();
  } else {
    $("#login-screen").style.display = "block";
    $("#admin-screen").style.display = "none";
  }
});

async function loadAllData() {
  const [teams, cfg] = await Promise.all([getAllTeamsContentOnce(), getEventConfigOnce()]);
  TEAMS_DATA = {};
  for (const color of TEAM_COLORS) TEAMS_DATA[color] = teams[color] || emptyTeam(color);
  CONFIG_DATA = cfg || defaultConfig();
}

// ---- Onglet Général -----------------------------------------------------------

function renderGeneral() {
  $("#cfg-eventName").value = CONFIG_DATA.eventName || "";
  $("#cfg-eventDate").value = CONFIG_DATA.eventDate || "";
  $("#cfg-duration").value = CONFIG_DATA.durationMinutes ?? 120;
  $("#cfg-maxDuration").value = CONFIG_DATA.maxDurationMinutes ?? 150;
  const conv = CONFIG_DATA.convergence || {};
  $("#cfg-conv-name").value = conv.name || "";
  $("#cfg-conv-detail").value = conv.detail || "";
  $("#cfg-conv-lat").value = conv.lat ?? "";
  $("#cfg-conv-lng").value = conv.lng ?? "";
  $("#cfg-conv-time").value = conv.time || "";

  const lat = conv.lat || 48.5798;
  const lng = conv.lng || 7.7422;
  if (!cfgMap) {
    cfgMap = createMap("cfg-map", [lat, lng], 15);
    cfgMap.on("click", (e) => {
      $("#cfg-conv-lat").value = e.latlng.lat.toFixed(6);
      $("#cfg-conv-lng").value = e.latlng.lng.toFixed(6);
      placeCfgMarker(e.latlng.lat, e.latlng.lng);
    });
  }
  placeCfgMarker(lat, lng);
}

function placeCfgMarker(lat, lng) {
  if (cfgMarker) cfgMarker.remove();
  cfgMarker = addCustomMarker(cfgMap, lat, lng, { color: "#ffd12e", emoji: "🏁", big: true });
  cfgMap.setView([lat, lng]);
}

$("#btn-save-general").addEventListener("click", async () => {
  CONFIG_DATA = {
    eventName: $("#cfg-eventName").value.trim(),
    eventDate: $("#cfg-eventDate").value,
    durationMinutes: Number($("#cfg-duration").value) || 120,
    maxDurationMinutes: Number($("#cfg-maxDuration").value) || 150,
    convergence: {
      name: $("#cfg-conv-name").value.trim(),
      detail: $("#cfg-conv-detail").value.trim(),
      lat: Number($("#cfg-conv-lat").value) || 0,
      lng: Number($("#cfg-conv-lng").value) || 0,
      time: $("#cfg-conv-time").value,
    },
  };
  try {
    await saveEventConfig(CONFIG_DATA);
    flash("Paramètres généraux enregistrés ✅");
  } catch (err) {
    flash("Erreur : " + err.message, true);
  }
});

// ---- Onglets équipe --------------------------------------------------------------

function renderTeamPanels() {
  const wrap = $("#team-panels");
  wrap.innerHTML = "";
  for (const color of TEAM_COLORS) {
    const panel = document.createElement("div");
    panel.className = "tab-panel";
    panel.id = `tab-${color}`;
    panel.style.display = "none";
    panel.innerHTML = renderTeamPanelHtml(color);
    wrap.appendChild(panel);
    wireTeamPanel(color, panel);
  }
}

function renderTeamPanelHtml(color) {
  const team = TEAMS_DATA[color];
  return `
    <div class="admin-card">
      <h3>Équipe ${TEAM_LABELS[color]}</h3>
      <div class="grid-2">
        <div class="field"><label>Nom affiché</label><input class="t-label" value="${escapeHtml(team.label)}" /></div>
        <div class="field"><label>Nom du super-héros</label><input class="t-hero" value="${escapeHtml(team.heroName || "")}" /></div>
      </div>
    </div>
    <div class="epreuve-tabs">
      ${team.epreuves
        .map((ep, i) => `<div class="epreuve-tab ${i === 0 ? "active" : ""}" data-idx="${i}">${escapeHtml(ep.titre || "Épreuve " + (i + 1))}</div>`)
        .join("")}
    </div>
    <div class="epreuve-forms">
      ${team.epreuves.map((ep, i) => renderEpreuveForm(ep, i)).join("")}
    </div>
    <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
      <button class="btn btn-gold save-team" style="flex:1; min-width:200px;">💾 Enregistrer l'équipe ${TEAM_LABELS[color]}</button>
      <button class="btn btn-danger reset-team">🔄 Réinitialiser la partie</button>
    </div>
  `;
}

function renderEpreuveForm(ep, i) {
  return `
  <div class="epreuve-form" data-idx="${i}" style="display:${i === 0 ? "" : "none"};">
    <div class="admin-card">
      <div class="field"><label>Titre de l'épreuve</label><input class="ep-titre" value="${escapeHtml(ep.titre || "")}" /></div>
    </div>
    <div class="admin-card">
      <h3>📍 Coordonnées GPS <span class="muted" style="font-weight:400;">(pour la carte intégrée "Voir sur la carte")</span></h3>
      <div class="grid-2">
        <div class="field"><label>Latitude</label><input class="ep-lieu-lat" type="number" step="0.000001" value="${ep.lieu?.lat ?? ""}" /></div>
        <div class="field"><label>Longitude</label><input class="ep-lieu-lng" type="number" step="0.000001" value="${ep.lieu?.lng ?? ""}" /></div>
      </div>
      <div class="ep-map" style="height:200px;border-radius:12px;overflow:hidden;"></div>
      <p class="muted" style="font-size:12px;margin-top:6px;">Clique sur la carte pour placer le lieu précis.</p>
    </div>
    <div class="admin-card">
      <h3>🔑 Code</h3>
      <div class="grid-2">
        <div class="field"><label>Code à saisir</label><input class="ep-code-valeur" value="${escapeHtml(ep.code?.valeur || "")}" /></div>
        <div class="field"><label>Essais avant piège</label><input class="ep-code-essais" type="number" min="1" value="${ep.code?.essaisAvantPiege ?? 2}" /></div>
      </div>
    </div>
    <div class="admin-card">
      <h3>⚠️ Piège</h3>
      <div class="grid-2">
        <div class="field"><label>Texte affiché</label><input class="ep-piege-texte" value="${escapeHtml(ep.piege?.texte || "")}" /></div>
        <div class="field"><label>Durée pénalité (min)</label><input class="ep-piege-duree" type="number" min="1" value="${ep.piege?.dureeMinutes ?? 2}" /></div>
      </div>
    </div>
    <div class="admin-card">
      <h3>⭐ Révélation <span class="muted" style="font-weight:400;">(affichée après validation du code)</span></h3>
      <div class="field"><textarea class="ep-revelation">${escapeHtml(ep.revelation?.texte || "")}</textarea></div>
    </div>

    <div class="admin-card">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
        <h3 style="margin:0;">🧩 Contenu de la page (blocs)</h3>
        <div style="position:relative;">
          <button type="button" class="btn btn-gold btn-sm add-block-btn">+ Ajouter un bloc</button>
          <div class="add-block-menu" style="display:none;"></div>
        </div>
      </div>
      <p class="muted" style="font-size:13px; margin-bottom:12px;">Composez librement la page vue par l'équipe avant validation du code : texte, photo, vidéo, lien carte, indices. Décochez "Visible" pour préparer un bloc sans le publier.</p>
      <div class="blocks-list"></div>
    </div>

    <div class="admin-card">
      <h3>👁️ Aperçu joueur</h3>
      <div class="player-preview preview-frame"></div>
    </div>
  </div>`;
}

// ---- Éditeur de blocs -----------------------------------------------------

function renderBlocksList(color, epIdx, panel) {
  const form = panel.querySelector(`.epreuve-form[data-idx="${epIdx}"]`);
  if (!form) return;
  const listEl = form.querySelector(".blocks-list");
  const ep = TEAMS_DATA[color].epreuves[epIdx];
  const blocks = ep.blocks || (ep.blocks = []);
  listEl.innerHTML = "";
  blocks.forEach((block, bi) => {
    listEl.appendChild(renderBlockItem(color, epIdx, block, bi, blocks.length, panel));
  });
  renderPreview(color, epIdx, panel);
}

function renderBlockItem(color, epIdx, block, bi, total, panel) {
  const meta = blockTypeMeta(block.type);
  const item = document.createElement("div");
  item.className = "block-editor-item";

  const head = document.createElement("div");
  head.className = "block-editor-head";
  head.innerHTML = `
    <span class="block-type-badge">${meta.icon} ${meta.label}</span>
    <label class="block-visible-toggle"><input type="checkbox" class="block-visible-cb" ${block.visible ? "checked" : ""}> Visible</label>
    <span style="flex:1"></span>
    <button type="button" class="icon-btn move-up" title="Monter" ${bi === 0 ? "disabled" : ""}>↑</button>
    <button type="button" class="icon-btn move-down" title="Descendre" ${bi === total - 1 ? "disabled" : ""}>↓</button>
    <button type="button" class="icon-btn delete-block" title="Supprimer">🗑️</button>
  `;
  item.appendChild(head);

  const body = document.createElement("div");
  body.className = "block-editor-body";
  body.appendChild(renderBlockBody(color, epIdx, block, panel));
  item.appendChild(body);

  head.querySelector(".block-visible-cb").addEventListener("change", (e) => {
    block.visible = e.target.checked;
    renderPreview(color, epIdx, panel);
  });
  head.querySelector(".move-up").addEventListener("click", () => {
    const blocks = TEAMS_DATA[color].epreuves[epIdx].blocks;
    if (bi === 0) return;
    [blocks[bi - 1], blocks[bi]] = [blocks[bi], blocks[bi - 1]];
    renderBlocksList(color, epIdx, panel);
  });
  head.querySelector(".move-down").addEventListener("click", () => {
    const blocks = TEAMS_DATA[color].epreuves[epIdx].blocks;
    if (bi === blocks.length - 1) return;
    [blocks[bi + 1], blocks[bi]] = [blocks[bi], blocks[bi + 1]];
    renderBlocksList(color, epIdx, panel);
  });
  head.querySelector(".delete-block").addEventListener("click", () => {
    if (!confirm("Supprimer ce bloc ?")) return;
    const blocks = TEAMS_DATA[color].epreuves[epIdx].blocks;
    blocks.splice(bi, 1);
    renderBlocksList(color, epIdx, panel);
  });

  return item;
}

function renderBlockBody(color, epIdx, block, panel) {
  const wrap = document.createElement("div");

  if (block.type === "texte") {
    wrap.innerHTML = `
      <div class="rte-toolbar">
        <button type="button" class="rte-btn" data-cmd="bold" title="Gras"><b>B</b></button>
        <button type="button" class="rte-btn" data-cmd="italic" title="Italique"><i>I</i></button>
        <button type="button" class="rte-btn" data-cmd="underline" title="Souligné"><u>U</u></button>
        <select class="rte-size" title="Taille">
          <option value="2">Petit</option>
          <option value="3" selected>Normal</option>
          <option value="5">Grand</option>
          <option value="6">Très grand</option>
        </select>
        <input type="color" class="rte-color" value="#ffffff" title="Couleur du texte">
        <button type="button" class="rte-btn" data-cmd="justifyLeft" title="Aligner à gauche">⯇</button>
        <button type="button" class="rte-btn" data-cmd="justifyCenter" title="Centrer">≡</button>
        <button type="button" class="rte-btn" data-cmd="justifyRight" title="Aligner à droite">⯈</button>
        <button type="button" class="rte-btn" data-cmd="insertUnorderedList" title="Liste à puces">• Liste</button>
      </div>
      <div class="rte-editor" contenteditable="true"></div>
    `;
    const editor = wrap.querySelector(".rte-editor");
    editor.innerHTML = block.html || "";
    wrap.querySelectorAll(".rte-btn").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        editor.focus();
        document.execCommand(btn.dataset.cmd, false, null);
        block.html = editor.innerHTML;
        renderPreview(color, epIdx, panel);
      });
    });
    const sizeSel = wrap.querySelector(".rte-size");
    sizeSel.addEventListener("mousedown", (e) => e.stopPropagation());
    sizeSel.addEventListener("change", () => {
      editor.focus();
      document.execCommand("fontSize", false, sizeSel.value);
      block.html = editor.innerHTML;
      renderPreview(color, epIdx, panel);
    });
    const colorInput = wrap.querySelector(".rte-color");
    colorInput.addEventListener("input", () => {
      editor.focus();
      document.execCommand("foreColor", false, colorInput.value);
      block.html = editor.innerHTML;
      renderPreview(color, epIdx, panel);
    });
    editor.addEventListener("input", () => {
      block.html = editor.innerHTML;
      renderPreview(color, epIdx, panel);
    });
  } else if (block.type === "photo") {
    wrap.innerHTML = `
      <div class="field"><label>Image</label><input type="file" accept="image/*" class="photo-file-input"></div>
      <div class="photo-upload-status muted" style="font-size:13px;"></div>
      <div class="photo-preview">${block.url ? `<img src="${escapeHtml(block.url)}" style="max-width:180px;border-radius:10px;">` : ""}</div>
      <div class="field" style="margin-top:8px;"><label>Légende (optionnel)</label><input class="photo-caption" value="${escapeHtml(block.caption || "")}"></div>
    `;
    const fileInput = wrap.querySelector(".photo-file-input");
    const statusEl = wrap.querySelector(".photo-upload-status");
    const previewEl = wrap.querySelector(".photo-preview");
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      statusEl.textContent = "Envoi en cours…";
      try {
        const url = await uploadBlockImage(file, (p) => {
          statusEl.textContent = `Envoi en cours… ${Math.round(p * 100)}%`;
        });
        block.url = url;
        statusEl.textContent = "✅ Image envoyée";
        previewEl.innerHTML = `<img src="${escapeHtml(url)}" style="max-width:180px;border-radius:10px;">`;
        renderPreview(color, epIdx, panel);
      } catch (err) {
        statusEl.textContent = "❌ Échec de l'envoi : " + (err.message || "erreur inconnue");
      }
    });
    wrap.querySelector(".photo-caption").addEventListener("input", (e) => {
      block.caption = e.target.value;
      renderPreview(color, epIdx, panel);
    });
  } else if (block.type === "video") {
    wrap.innerHTML = `
      <div class="field"><label>Lien YouTube</label><input class="video-url" value="${escapeHtml(block.url || "")}" placeholder="https://youtube.com/watch?v=..."></div>
      <div class="video-status muted" style="font-size:13px;">${block.youtubeId ? "✅ Vidéo reconnue" : ""}</div>
    `;
    const input = wrap.querySelector(".video-url");
    const status = wrap.querySelector(".video-status");
    input.addEventListener("input", () => {
      block.url = input.value.trim();
      const id = parseYouTubeId(block.url);
      block.youtubeId = id;
      status.textContent = block.url ? (id ? "✅ Vidéo reconnue" : "⚠️ Lien YouTube non reconnu") : "";
      renderPreview(color, epIdx, panel);
    });
  } else if (block.type === "carte") {
    wrap.innerHTML = `
      <div class="field"><label>Lien Google Maps</label><input class="carte-url" value="${escapeHtml(block.url || "")}" placeholder="https://maps.google.com/..."></div>
      <div class="field"><label>Texte du bouton</label><input class="carte-label" value="${escapeHtml(block.label || "")}"></div>
    `;
    wrap.querySelector(".carte-url").addEventListener("input", (e) => {
      block.url = e.target.value.trim();
      renderPreview(color, epIdx, panel);
    });
    wrap.querySelector(".carte-label").addEventListener("input", (e) => {
      block.label = e.target.value;
      renderPreview(color, epIdx, panel);
    });
  } else if (block.type === "indice") {
    wrap.innerHTML = `<div class="field"><textarea class="indice-texte">${escapeHtml(block.texte || "")}</textarea></div>`;
    wrap.querySelector(".indice-texte").addEventListener("input", (e) => {
      block.texte = e.target.value;
      renderPreview(color, epIdx, panel);
    });
  }

  return wrap;
}

function renderPreview(color, epIdx, panel) {
  const form = panel.querySelector(`.epreuve-form[data-idx="${epIdx}"]`);
  if (!form) return;
  const previewEl = form.querySelector(".player-preview");
  const blocks = TEAMS_DATA[color].epreuves[epIdx].blocks || [];
  const visible = blocks.filter((b) => b.visible);
  previewEl.innerHTML = "";
  if (!visible.length) {
    previewEl.innerHTML = `<p class="muted" style="font-size:13px;">Aucun bloc visible pour l'instant.</p>`;
    return;
  }
  visible.forEach((block) => previewEl.appendChild(renderPreviewBlock(block)));
}

function renderPreviewBlock(block) {
  const el = document.createElement("div");
  if (block.type === "texte") {
    el.className = "card block-texte";
    el.innerHTML = block.html || "";
  } else if (block.type === "photo") {
    el.className = "card block-photo";
    if (block.url) {
      const img = document.createElement("img");
      img.src = block.url;
      el.appendChild(img);
    } else {
      el.innerHTML = `<p class="muted" style="font-size:13px;">(aucune image envoyée)</p>`;
    }
    if (block.caption) {
      const p = document.createElement("p");
      p.className = "muted";
      p.style.marginTop = "8px";
      p.textContent = block.caption;
      el.appendChild(p);
    }
  } else if (block.type === "video") {
    el.className = "card block-video";
    el.innerHTML = block.youtubeId
      ? `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(block.youtubeId)}" allowfullscreen loading="lazy"></iframe></div>`
      : `<p class="muted" style="font-size:13px;">(lien vidéo non reconnu)</p>`;
  } else if (block.type === "carte") {
    el.className = "card block-carte";
    const a = document.createElement("a");
    a.href = block.url || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "btn btn-outline btn-block";
    a.textContent = "🗺️ " + (block.label || "Voir l'itinéraire");
    el.appendChild(a);
  } else if (block.type === "indice") {
    el.className = "card revelation block-indice";
    el.innerHTML = `<div class="card-head"><div class="card-pict">💡</div><div class="card-family">Indice (masqué par défaut côté joueur)</div></div><p>${escapeHtml(block.texte || "")}</p>`;
  }
  return el;
}

function wireAddBlockMenu(color, epIdx, panel, form) {
  const btn = form.querySelector(".add-block-btn");
  const menu = form.querySelector(".add-block-menu");
  const types = ["texte", "photo", "video", "carte", "indice"];
  menu.innerHTML = types
    .map((t) => {
      const meta = blockTypeMeta(t);
      return `<button type="button" class="add-block-option" data-type="${t}">${meta.icon} ${meta.label}</button>`;
    })
    .join("");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "none" ? "flex" : "none";
  });
  menu.querySelectorAll(".add-block-option").forEach((optBtn) => {
    optBtn.addEventListener("click", () => {
      const type = optBtn.dataset.type;
      TEAMS_DATA[color].epreuves[epIdx].blocks.push(blockDefaults(type));
      menu.style.display = "none";
      renderBlocksList(color, epIdx, panel);
    });
  });
  document.addEventListener("click", (e) => {
    if (menu.style.display !== "none" && !menu.contains(e.target) && e.target !== btn) {
      menu.style.display = "none";
    }
  });
}

function wireTeamPanel(color, panel) {
  epMaps[color] = [];
  activeEpIdx[color] = 0;

  panel.querySelectorAll(".epreuve-form").forEach((form) => {
    const idx = Number(form.dataset.idx);
    renderBlocksList(color, idx, panel);
    wireAddBlockMenu(color, idx, panel, form);
  });

  panel.querySelectorAll(".epreuve-tab").forEach((tabEl) => {
    tabEl.addEventListener("click", () => {
      const idx = Number(tabEl.dataset.idx);
      activeEpIdx[color] = idx;
      panel.querySelectorAll(".epreuve-tab").forEach((t) => t.classList.toggle("active", t === tabEl));
      panel.querySelectorAll(".epreuve-form").forEach((f) => {
        f.style.display = Number(f.dataset.idx) === idx ? "" : "none";
      });
      ensureEpMap(color, idx, panel);
    });
  });

  panel.querySelector(".save-team").addEventListener("click", () => saveTeamPanel(color, panel));
  panel.querySelector(".reset-team").addEventListener("click", async () => {
    if (
      confirm(
        `Réinitialiser la progression en cours de l'équipe ${TEAM_LABELS[color]} ? (à utiliser avant chaque test, ou avant le jour J)`
      )
    ) {
      try {
        await resetTeamState(color);
        flash("Progression réinitialisée ✅");
      } catch (err) {
        flash("Erreur : " + err.message, true);
      }
    }
  });
}

function ensureEpMap(color, idx, panel) {
  const form = panel.querySelector(`.epreuve-form[data-idx="${idx}"]`);
  if (!form) return;
  if (epMaps[color][idx]) {
    setTimeout(() => epMaps[color][idx].invalidateSize(), 50);
    return;
  }
  const latInput = form.querySelector(".ep-lieu-lat");
  const lngInput = form.querySelector(".ep-lieu-lng");
  const lat = Number(latInput.value) || 48.5836;
  const lng = Number(lngInput.value) || 7.7458;
  const mapEl = form.querySelector(".ep-map");
  const m = createMap(mapEl, [lat, lng], 15);
  let marker = addCustomMarker(m, lat, lng, { color: "#2563eb", emoji: "📍" });
  m.on("click", (e) => {
    latInput.value = e.latlng.lat.toFixed(6);
    lngInput.value = e.latlng.lng.toFixed(6);
    marker.remove();
    marker = addCustomMarker(m, e.latlng.lat, e.latlng.lng, { color: "#2563eb", emoji: "📍" });
  });
  epMaps[color][idx] = m;
  setTimeout(() => m.invalidateSize(), 100);
}

async function saveTeamPanel(color, panel) {
  const label = panel.querySelector(".t-label").value.trim();
  const heroName = panel.querySelector(".t-hero").value.trim();
  const epreuveForms = panel.querySelectorAll(".epreuve-form");
  const epreuves = Array.from(epreuveForms).map((f, i) => ({
    titre: f.querySelector(".ep-titre").value.trim(),
    lieu: {
      lat: Number(f.querySelector(".ep-lieu-lat").value) || 0,
      lng: Number(f.querySelector(".ep-lieu-lng").value) || 0,
    },
    code: {
      valeur: f.querySelector(".ep-code-valeur").value.trim(),
      essaisAvantPiege: Number(f.querySelector(".ep-code-essais").value) || 2,
    },
    piege: {
      texte: f.querySelector(".ep-piege-texte").value.trim(),
      dureeMinutes: Number(f.querySelector(".ep-piege-duree").value) || 2,
    },
    revelation: {
      texte: f.querySelector(".ep-revelation").value.trim(),
    },
    blocks: (TEAMS_DATA[color].epreuves[i]?.blocks || []).map((b) => ({ ...b })),
  }));
  const teamData = { label, heroName, epreuves };
  try {
    await saveTeamContent(color, teamData);
    TEAMS_DATA[color] = teamData;
    flash(`Équipe ${TEAM_LABELS[color]} enregistrée ✅`);
  } catch (err) {
    flash("Erreur : " + err.message, true);
  }
}

// ---- Navigation entre onglets principaux -------------------------------------------

$("#main-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  const tab = btn.dataset.tab;
  document.querySelectorAll("#main-tabs .tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
  document.querySelectorAll(".tab-panel").forEach((p) => (p.style.display = "none"));
  const targetPanel = document.getElementById(`tab-${tab}`);
  targetPanel.style.display = "block";
  if (tab === "general") {
    setTimeout(() => cfgMap && cfgMap.invalidateSize(), 60);
  } else {
    setTimeout(() => ensureEpMap(tab, activeEpIdx[tab] || 0, targetPanel), 60);
  }
});
