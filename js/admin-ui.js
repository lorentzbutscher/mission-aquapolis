// ============================================================================
// admin-ui.js — v2 — refonte ergonomique de l'espace d'administration
// Chargé APRÈS js/admin.js. Ne réécrit rien : reconstruit l'enveloppe autour de
// l'interface existante. Toute la logique Firebase, l'éditeur riche, les envois
// de fichiers, les cartes Leaflet et le bouton « Recharger le contenu » sont
// laissés intacts.
//
// v2 : découpe l'onglet Général (devenu un formulaire de 8 sections) en pages
// navigables, et intègre les écrans ajoutés depuis (accès, briefing,
// phases 4/5/6, écran de fin, rassemblement, maintenance).
//
// Pour désactiver : retirer la balise <script> dans admin.html.
// ============================================================================

const A = () => window.__aqAdmin;

const DOT = {
  general: "#8497b8",
  __final__: "#ffd12e",
  bleu: "#2563eb",
  rouge: "#dc2626",
  jaune: "#eab308",
  vert: "#16a34a",
  violet: "#7c3aed",
};

let dirty = 0;
let lastPublished = null;
let statusEl, statusWrap, publishedEl;
let generalSections = [];

const strip = (s) => s.replace(/^[^\p{L}\d]+/u, "").trim();

// ---------------------------------------------------------------- barre haute

function buildTopbar() {
  if (document.getElementById("aq-topbar")) return;
  const bar = document.createElement("div");
  bar.id = "aq-topbar";
  bar.innerHTML = `
    <div class="aq-top-left">
      <span class="aq-top-title">Mission Aquapolis — administration</span>
      <span class="aq-status"><span class="aq-status-dot"></span><span class="aq-status-text">Tout est publié</span></span>
      <span class="aq-published"></span>
    </div>
    <div class="aq-top-right">
      <button type="button" class="aq-btn" id="aq-discard">Annuler les modifications</button>
      <button type="button" class="aq-btn aq-btn-primary" id="aq-publish">Publier</button>
    </div>`;
  document.body.appendChild(bar);
  document.body.classList.add("aq-shell");

  statusEl = bar.querySelector(".aq-status-text");
  statusWrap = bar.querySelector(".aq-status");
  publishedEl = bar.querySelector(".aq-published");

  bar.querySelector("#aq-discard").addEventListener("click", () => {
    if (!dirty) return;
    if (confirm("Annuler toutes les modifications non publiées et recharger la dernière version enregistrée ?")) location.reload();
  });
  bar.querySelector("#aq-publish").addEventListener("click", publishAll);
  renderStatus();
}

function renderStatus() {
  if (!statusEl) return;
  statusEl.textContent = dirty
    ? dirty + " modification" + (dirty > 1 ? "s" : "") + " en brouillon"
    : "Tout est publié";
  statusWrap.classList.toggle("aq-dirty", dirty > 0);
  publishedEl.textContent = lastPublished ? "Dernière publication : " + lastPublished : "";
}

function markDirty() {
  dirty += 1;
  renderStatus();
}

async function publishAll() {
  const btn = document.getElementById("aq-publish");
  btn.disabled = true;
  btn.textContent = "Publication…";
  const buttons = [
    document.getElementById("btn-save-general"),
    ...document.querySelectorAll("#team-panels .save-team"),
  ].filter(Boolean);
  for (const b of buttons) {
    b.click();
    await new Promise((r) => setTimeout(r, 800));
  }
  dirty = 0;
  lastPublished = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  renderStatus();
  btn.disabled = false;
  btn.textContent = "Publier";
}

// -------------------------------------------- découpe de l'onglet « Général »
// L'onglet Général est une seule .admin-card contenant 8 sous-parties séparées
// par des <h3>. On les enveloppe pour n'en afficher qu'une à la fois.

function splitGeneral() {
  const anchor = document.getElementById("cfg-eventName");
  if (!anchor) return [];
  const card = anchor.closest(".admin-card");
  if (card.dataset.aqSplit) return [...card.querySelectorAll(":scope > .aq-sec")];
  card.dataset.aqSplit = "1";

  const save = document.getElementById("btn-save-general");
  const nodes = [...card.children].filter((n) => n !== save);
  const secs = [];
  let cur = null;

  const open = (label) => {
    cur = document.createElement("div");
    cur.className = "aq-sec";
    cur.dataset.label = label;
    card.appendChild(cur);
    secs.push(cur);
    return cur;
  };

  nodes.forEach((node) => {
    if (node.tagName === "H3") open(strip(node.textContent));
    if (!cur) open("Paramètres");
    cur.appendChild(node);
  });

  if (save) card.appendChild(save);

  // La section « Phases 4, 5 et 6 » contient trois sous-cartes : une page chacune.
  const phaseSec = secs.find((s) => /phases/i.test(s.dataset.label));
  if (phaseSec) {
    const subs = [...phaseSec.querySelectorAll(":scope > .admin-card")];
    if (subs.length > 1) {
      const idx = secs.indexOf(phaseSec);
      const made = subs.map((sub) => {
        const s = document.createElement("div");
        s.className = "aq-sec";
        const h4 = sub.querySelector("h4");
        s.dataset.label = h4 ? strip(h4.textContent) : "Phase";
        s.appendChild(sub);
        card.appendChild(s);
        return s;
      });
      // l'intitulé et la note d'intro restent en tête de la première phase
      [...phaseSec.childNodes].forEach((n) => made[0].insertBefore(n, made[0].firstChild));
      phaseSec.remove();
      secs.splice(idx, 1, ...made);
    }
  }

  // La carte de maintenance (« Recharger le contenu Appli ») devient sa page.
  const reload = document.getElementById("btn-reload-appli-content");
  if (reload) {
    const rc = reload.closest(".admin-card");
    const s = document.createElement("div");
    s.className = "aq-sec";
    s.dataset.label = "Maintenance du contenu";
    rc.parentNode.insertBefore(s, rc);
    s.appendChild(rc);
    secs.push(s);
  }

  return secs;
}

function showGeneralSection(sec) {
  generalSections.forEach((s) => s.classList.toggle("active", s === sec));
  const save = document.getElementById("btn-save-general");
  if (save) {
    const isMaint = sec && /maintenance/i.test(sec.dataset.label || "");
    save.style.display = isMaint ? "none" : "";
  }
}

// ------------------------------------------------------------------- colonne

function buildSidebar() {
  const screen = document.getElementById("admin-screen");
  const tabs = document.getElementById("main-tabs");
  if (!screen || !tabs) return;

  generalSections = splitGeneral();

  let side = document.getElementById("aq-sidebar");
  if (!side) {
    side = document.createElement("nav");
    side.id = "aq-sidebar";
    screen.insertBefore(side, document.getElementById("tab-general"));
  }
  side.innerHTML = "";

  const title = (t) => {
    const d = document.createElement("div");
    d.className = "aq-side-title";
    d.textContent = t;
    side.appendChild(d);
  };

  const generalBtn = tabs.querySelector('.tab-btn[data-tab="general"]');
  const finalBtn = tabs.querySelector('.tab-btn[data-tab="__final__"]');

  title("Réglages généraux");
  generalSections.forEach((sec) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "aq-side-link aq-side-gen";
    b.textContent = sec.dataset.label;
    b.addEventListener("click", () => {
      generalBtn.click();
      showGeneralSection(sec);
      mark(b);
      window.scrollTo({ top: 0 });
    });
    side.appendChild(b);
  });

  title("Contenu des brigades");
  [...tabs.querySelectorAll(".tab-btn")].forEach((btn) => {
    const key = btn.dataset.tab;
    if (key === "general" || key === "__final__") return;
    const item = makeItem("Brigade " + strip(btn.textContent), btn, DOT[key]);
    side.appendChild(item);
    const sub = document.createElement("div");
    sub.className = "aq-side-sub";
    sub.dataset.for = key;
    side.appendChild(sub);
    fillSub(key, btn, sub);
  });

  if (finalBtn) {
    title("Épreuve finale");
    side.appendChild(makeItem(strip(finalBtn.textContent), finalBtn, DOT.__final__));
  }

  if (generalSections.length) {
    showGeneralSection(generalSections[0]);
    mark(side.querySelector(".aq-side-gen"));
  }
  highlightTeam();
}

function mark(el) {
  document.querySelectorAll("#aq-sidebar .aq-side-link, #aq-sidebar .aq-side-item")
    .forEach((n) => n.classList.remove("current"));
  if (el) el.classList.add("current");
}

function makeItem(label, tabBtn, color) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "aq-side-item";
  if (color) {
    const dot = document.createElement("span");
    dot.className = "aq-dot";
    dot.style.background = color;
    b.appendChild(dot);
  }
  b.appendChild(document.createTextNode(label));
  b.addEventListener("click", () => {
    tabBtn.click();
    const panel = document.getElementById("tab-" + tabBtn.dataset.tab);
    if (panel) showTeamSection(panel, "palais");
    highlightTeam(tabBtn.dataset.tab);
    mark(b);
    window.scrollTo({ top: 0 });
  });
  return b;
}

// Prologue et épreuves étaient empilés : le menu semblait ne pas répondre.
function showTeamSection(panel, what) {
  const palais = panel.querySelector(".palais-forms");
  if (!palais) return;
  const head = palais.previousElementSibling;
  const isPalais = what === "palais";
  palais.style.display = isPalais ? "" : "none";
  if (head && head.classList.contains("admin-card")) head.style.display = isPalais ? "" : "none";
  const epTabs = panel.querySelector(".epreuve-tabs");
  if (epTabs) epTabs.style.display = isPalais ? "none" : "";
  panel.querySelectorAll(".epreuve-forms:not(.palais-forms)").forEach((el) => {
    el.style.display = isPalais ? "none" : "";
  });
}

function fillSub(key, tabBtn, sub) {
  const panel = document.getElementById("tab-" + key);
  if (!panel) return;
  sub.innerHTML = "";

  if (panel.querySelector(".palais-forms")) {
    const p = document.createElement("button");
    p.type = "button";
    p.className = "aq-side-link";
    p.textContent = "Palais du Rhin (prologue)";
    p.addEventListener("click", () => {
      tabBtn.click();
      showTeamSection(panel, "palais");
      highlightTeam(key);
      mark(p);
      window.scrollTo({ top: 0 });
    });
    sub.appendChild(p);
  }

  panel.querySelectorAll(".epreuve-tabs > .epreuve-tab").forEach((tab, i) => {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "aq-side-link";
    link.textContent = "Étape " + (i + 1) + " — " + tab.textContent;
    link.addEventListener("click", () => {
      tabBtn.click();
      tab.click();
      showTeamSection(panel, "epreuves");
      highlightTeam(key);
      mark(link);
      window.scrollTo({ top: 0 });
    });
    sub.appendChild(link);
  });
}

function highlightTeam(key) {
  const active = key || document.querySelector("#main-tabs .tab-btn.active")?.dataset.tab;
  document.querySelectorAll("#aq-sidebar .aq-side-sub").forEach((el) => {
    el.style.display = el.dataset.for === active ? "flex" : "none";
  });
}

// ----------------------------------------------------------- blocs repliables

function summary(item) {
  const rte = item.querySelector(".rte-editor");
  if (rte) return (rte.innerText || "").trim().slice(0, 70);
  const ta = item.querySelector("textarea");
  if (ta) return (ta.value || "").trim().slice(0, 70);
  const input = item.querySelector("input[type='text'], input:not([type])");
  if (input) return (input.value || "").trim().slice(0, 70);
  const sel = item.querySelector("select");
  if (sel) return sel.options[sel.selectedIndex]?.text || "";
  return "";
}

function enhanceBlocks() {
  document.querySelectorAll(".block-editor-item").forEach((item) => {
    if (item.dataset.aqEnhanced) {
      const s = item.querySelector(".aq-block-summary");
      if (s && item.classList.contains("aq-collapsed")) s.textContent = summary(item);
      return;
    }
    item.dataset.aqEnhanced = "1";
    const head = item.querySelector(".block-editor-head");
    const body = item.querySelector(".block-editor-body");
    if (!head || !body) return;

    const sum = document.createElement("span");
    sum.className = "aq-block-summary";
    sum.textContent = summary(item);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "icon-btn aq-block-toggle";
    toggle.textContent = "▾";
    toggle.title = "Replier / déplier";

    head.insertBefore(toggle, head.firstChild);
    const spacer = head.querySelector("span[style*='flex']");
    if (spacer) head.insertBefore(sum, spacer);
    else head.appendChild(sum);

    const set = (c) => {
      item.classList.toggle("aq-collapsed", c);
      body.style.display = c ? "none" : "";
      toggle.textContent = c ? "▸" : "▾";
      if (c) sum.textContent = summary(item);
    };
    toggle.addEventListener("click", () => set(!item.classList.contains("aq-collapsed")));
    sum.addEventListener("click", () => set(!item.classList.contains("aq-collapsed")));
    set(true);
  });
}

// -------------------------------------------- copier une étape vers d'autres

function injectDupButtons() {
  document.querySelectorAll("#team-panels .tab-panel").forEach((panel) => {
    const key = panel.id.replace("tab-", "");
    if (key === "__final__") return;
    panel.querySelectorAll(".epreuve-form:not([data-idx='palais'])").forEach((form) => {
      if (form.dataset.aqDup) return;
      form.dataset.aqDup = "1";
      const idx = Number(form.dataset.idx);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "aq-btn aq-dup-btn";
      btn.textContent = "Copier cette étape vers d'autres brigades…";
      btn.addEventListener("click", () => openDup(key, idx));
      form.insertBefore(btn, form.firstChild);
    });
  });
}

function openDup(srcColor, epIdx) {
  const api = A();
  if (!api) {
    alert("Fonction indisponible : la passerelle window.__aqAdmin manque dans js/admin.js.");
    return;
  }
  const labels = api.TEAM_LABELS;
  const others = api.TEAM_COLORS.filter((c) => c !== srcColor);
  const srcTitle = api.TEAMS_DATA[srcColor]?.epreuves[epIdx]?.titre || "Étape " + (epIdx + 1);

  const ov = document.createElement("div");
  ov.className = "aq-overlay";
  ov.innerHTML = `
    <div class="aq-modal">
      <h3>Copier « ${srcTitle} » vers…</h3>
      <p>Le contenu, les pages, le code et la révélation sont dupliqués dans l'étape ${epIdx + 1} des brigades cochées. Leur contenu actuel est remplacé. Le résultat reste en brouillon : tant que vous n'avez pas publié, « Annuler les modifications » le supprime.</p>
      <div class="aq-modal-list">
        ${others.map((c) => `<label><input type="checkbox" value="${c}" /> Brigade ${labels[c]}</label>`).join("")}
      </div>
      <div class="aq-modal-actions">
        <button type="button" class="aq-btn" data-act="cancel">Annuler</button>
        <button type="button" class="aq-btn aq-btn-primary" data-act="ok">Copier</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const close = () => ov.remove();
  ov.querySelector("[data-act='cancel']").addEventListener("click", close);
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector("[data-act='ok']").addEventListener("click", () => {
    const targets = [...ov.querySelectorAll("input:checked")].map((i) => i.value);
    if (!targets.length) return close();
    const src = JSON.parse(JSON.stringify(api.TEAMS_DATA[srcColor].epreuves[epIdx]));
    delete src._activePage;
    targets.forEach((c) => {
      const eps = api.TEAMS_DATA[c].epreuves;
      while (eps.length <= epIdx) eps.push(JSON.parse(JSON.stringify(src)));
      eps[epIdx] = JSON.parse(JSON.stringify(src));
    });
    close();
    api.renderTeamPanels();
    setTimeout(() => {
      buildSidebar();
      injectDupButtons();
      enhanceBlocks();
      document.querySelector(`#main-tabs .tab-btn[data-tab="${srcColor}"]`)?.click();
      highlightTeam(srcColor);
      targets.forEach(() => markDirty());
      alert("Étape copiée vers " + targets.length + " brigade" + (targets.length > 1 ? "s" : "") + ". Cliquez sur « Publier » pour l'envoyer aux téléphones.");
    }, 60);
  });
}

// -------------------------------------------------------------------- départ

function boot() {
  // admin.js applique display:block en style inline sur #admin-screen ; un style
  // inline l'emporte sur la feuille, la grille 2 colonnes ne prendrait pas.
  const screen = document.getElementById("admin-screen");
  const applyGrid = () => {
    const d = screen.style.display;
    if (d && d !== "none" && d !== "grid") screen.style.display = "grid";
    else if (!d && getComputedStyle(screen).display !== "none") screen.style.display = "grid";
  };
  applyGrid();
  new MutationObserver(applyGrid).observe(screen, { attributes: true, attributeFilter: ["style"] });

  buildTopbar();
  buildSidebar();
  injectDupButtons();
  enhanceBlocks();

  const onEdit = (e) => { if (e.target.closest("#admin-screen")) markDirty(); };
  document.addEventListener("input", onEdit);
  document.addEventListener("change", onEdit);
  document.getElementById("main-tabs")?.addEventListener("click", () => setTimeout(() => highlightTeam(), 30));

  const panels = document.getElementById("team-panels");
  if (panels) {
    new MutationObserver(() => {
      clearTimeout(window.__aqT);
      window.__aqT = setTimeout(() => { injectDupButtons(); enhanceBlocks(); }, 120);
    }).observe(panels, { childList: true, subtree: true });
  }
}

// --------------------------------------------------------------- amorçage
// L'écran d'admin est masqué par style inline jusqu'à la connexion Firebase.
// On observe l'attribut style au lieu d'interroger sa valeur en boucle, et on
// pose un marqueur sur <body> pour pouvoir vérifier d'un coup d'œil que ce
// script a bien démarré (Application > Elements : <body data-aq-ui="on">).
let booted = false;

function tryBoot(why) {
  if (booted) return;
  const screen = document.getElementById("admin-screen");
  if (!screen || !document.getElementById("cfg-eventName")) return;
  const cs = getComputedStyle(screen);
  if (cs.display === "none" || cs.visibility === "hidden") return;
  booted = true;
  try {
    boot();
    document.body.dataset.aqUi = "on";
    console.log("[admin-ui] interface v2 active (" + why + ")");
  } catch (err) {
    document.body.dataset.aqUi = "erreur";
    console.error("[admin-ui] échec du démarrage :", err);
  }
}

function watch() {
  const screen = document.getElementById("admin-screen");
  if (!screen) return setTimeout(watch, 150);
  console.log("[admin-ui] script chargé, en attente de la connexion");
  tryBoot("déjà visible");
  new MutationObserver(() => tryBoot("écran affiché"))
    .observe(screen, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
  // Filet : certaines séquences de connexion n'écrivent pas le style inline.
  const poll = setInterval(() => {
    tryBoot("scrutation");
    if (booted) clearInterval(poll);
  }, 400);
  setTimeout(() => clearInterval(poll), 60000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
else watch();
