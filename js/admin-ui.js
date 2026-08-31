// ============================================================================
// admin-ui.js — refonte ergonomique de l'espace d'administration
// Chargé APRÈS js/admin.js. Ne remplace rien : reconstruit l'enveloppe autour
// de l'interface existante (onglets, éditeur de blocs, cartes, Firebase intacts).
// Pour désactiver : retirer la balise <script> correspondante dans admin.html.
// ============================================================================

const A = () => window.__aqAdmin;

let dirty = 0;
let lastPublished = null;
let statusEl = null;
let statusDot = null;
let publishedEl = null;

// ---- Barre supérieure : état brouillon / publié ----------------------------

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
  statusDot = bar.querySelector(".aq-status");
  publishedEl = bar.querySelector(".aq-published");

  bar.querySelector("#aq-discard").addEventListener("click", () => {
    if (!dirty) return;
    if (confirm("Annuler toutes les modifications non publiées et recharger la dernière version enregistrée ?")) {
      location.reload();
    }
  });

  bar.querySelector("#aq-publish").addEventListener("click", publishAll);
  renderStatus();
}

function renderStatus() {
  if (!statusEl) return;
  statusEl.textContent = dirty
    ? dirty + " modification" + (dirty > 1 ? "s" : "") + " en brouillon"
    : "Tout est publié";
  statusDot.classList.toggle("aq-dirty", dirty > 0);
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
    await new Promise((r) => setTimeout(r, 700));
  }
  dirty = 0;
  lastPublished = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  renderStatus();
  btn.disabled = false;
  btn.textContent = "Publier";
}

// ---- Colonne de navigation --------------------------------------------------

function buildSidebar() {
  const screen = document.getElementById("admin-screen");
  const tabs = document.getElementById("main-tabs");
  if (!screen || !tabs) return;

  let side = document.getElementById("aq-sidebar");
  if (!side) {
    side = document.createElement("nav");
    side.id = "aq-sidebar";
    screen.insertBefore(side, document.getElementById("tab-general"));
  }
  side.innerHTML = "";

  const groupTitle = (t) => {
    const d = document.createElement("div");
    d.className = "aq-side-title";
    d.textContent = t;
    return d;
  };

  side.appendChild(groupTitle("Réglages"));
  [...tabs.querySelectorAll(".tab-btn")].forEach((btn) => {
    const key = btn.dataset.tab;
    const isTeam = !["general", "__final__"].includes(key);
    if (isTeam) return;
    side.appendChild(makeItem(btn.textContent.replace(/^[^\p{L}]+/u, "").trim(), btn, "aq-side-item"));
  });

  side.appendChild(groupTitle("Brigades"));
  [...tabs.querySelectorAll(".tab-btn")].forEach((btn) => {
    const key = btn.dataset.tab;
    if (["general", "__final__"].includes(key)) return;
    const item = makeItem("Brigade " + btn.textContent.replace(/^[^\p{L}]+/u, "").trim(), btn, "aq-side-item aq-side-team");
    item.dataset.team = key;
    side.appendChild(item);

    const sub = document.createElement("div");
    sub.className = "aq-side-sub";
    sub.dataset.for = key;
    side.appendChild(sub);
    fillSubItems(key, btn, sub);
  });

  highlightActive();
}

function fillSubItems(key, tabBtn, sub) {
  const panel = document.getElementById("tab-" + key);
  if (!panel) return;
  sub.innerHTML = "";

  const palais = document.createElement("button");
  palais.type = "button";
  palais.className = "aq-side-link";
  palais.textContent = "Palais du Rhin (prologue)";
  palais.addEventListener("click", () => {
    tabBtn.click();
    highlightActive(key);
    panel.querySelector(".palais-forms")?.scrollIntoView({ block: "start" });
  });
  sub.appendChild(palais);

  panel.querySelectorAll(".epreuve-tabs > .epreuve-tab").forEach((tab, i) => {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "aq-side-link";
    link.textContent = "Épreuve " + (i + 1) + " — " + tab.textContent;
    link.addEventListener("click", () => {
      tabBtn.click();
      tab.click();
      highlightActive(key);
      window.scrollTo({ top: 0 });
    });
    sub.appendChild(link);
  });
}

function makeItem(label, tabBtn, cls) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = label;
  b.addEventListener("click", () => {
    tabBtn.click();
    highlightActive(tabBtn.dataset.tab);
    window.scrollTo({ top: 0 });
  });
  return b;
}

function highlightActive(key) {
  const active = key || document.querySelector("#main-tabs .tab-btn.active")?.dataset.tab;
  document.querySelectorAll("#aq-sidebar .aq-side-item").forEach((el) => {
    const own = el.dataset.team || null;
    el.classList.remove("active");
  });
  document.querySelectorAll("#aq-sidebar .aq-side-sub").forEach((el) => {
    el.style.display = el.dataset.for === active ? "flex" : "none";
  });
  const items = [...document.querySelectorAll("#aq-sidebar .aq-side-item")];
  const tabButtons = [...document.querySelectorAll("#main-tabs .tab-btn")];
  const idx = tabButtons.findIndex((b) => b.dataset.tab === active);
  if (idx >= 0) {
    const label = tabButtons[idx].textContent.replace(/^[^\p{L}]+/u, "").trim();
    const match = items.find((el) => el.textContent.endsWith(label));
    if (match) match.classList.add("active");
  }
}

// ---- Blocs repliables --------------------------------------------------------

function blockSummary(item) {
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
      if (s && item.classList.contains("aq-collapsed")) s.textContent = blockSummary(item);
      return;
    }
    item.dataset.aqEnhanced = "1";
    const head = item.querySelector(".block-editor-head");
    const body = item.querySelector(".block-editor-body");
    if (!head || !body) return;

    const summary = document.createElement("span");
    summary.className = "aq-block-summary";
    summary.textContent = blockSummary(item);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "icon-btn aq-block-toggle";
    toggle.textContent = "▾";
    toggle.title = "Replier / déplier";

    head.insertBefore(toggle, head.firstChild);
    const spacer = head.querySelector("span[style*='flex']");
    if (spacer) head.insertBefore(summary, spacer);
    else head.appendChild(summary);

    const setCollapsed = (c) => {
      item.classList.toggle("aq-collapsed", c);
      body.style.display = c ? "none" : "";
      toggle.textContent = c ? "▸" : "▾";
      if (c) summary.textContent = blockSummary(item);
    };
    toggle.addEventListener("click", () => setCollapsed(!item.classList.contains("aq-collapsed")));
    summary.addEventListener("click", () => setCollapsed(!item.classList.contains("aq-collapsed")));
    setCollapsed(true);
  });
}

// ---- Copier une épreuve vers d'autres brigades --------------------------------

function injectDuplicateButtons() {
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
      btn.textContent = "Copier cette épreuve vers d'autres brigades…";
      btn.addEventListener("click", () => openDuplicate(key, idx));
      form.insertBefore(btn, form.firstChild);
    });
  });
}

function openDuplicate(srcColor, epIdx) {
  const api = A();
  if (!api) {
    alert("Fonction indisponible : le patch de js/admin.js n'a pas été appliqué.");
    return;
  }
  const labels = api.TEAM_LABELS;
  const others = api.TEAM_COLORS.filter((c) => c !== srcColor);
  const srcTitle = api.TEAMS_DATA[srcColor]?.epreuves[epIdx]?.titre || "Épreuve " + (epIdx + 1);

  const overlay = document.createElement("div");
  overlay.className = "aq-overlay";
  overlay.innerHTML = `
    <div class="aq-modal">
      <h3>Copier « ${srcTitle} » vers…</h3>
      <p>Le contenu, les pages, le code et la révélation sont dupliqués dans l'épreuve ${epIdx + 1} des brigades cochées. Leur contenu actuel est remplacé. Le résultat reste en brouillon : tant que vous n'avez pas publié, « Annuler les modifications » le supprime.</p>
      <div class="aq-modal-list">
        ${others.map((c) => `<label><input type="checkbox" value="${c}" /> Brigade ${labels[c]}</label>`).join("")}
      </div>
      <div class="aq-modal-actions">
        <button type="button" class="aq-btn" data-act="cancel">Annuler</button>
        <button type="button" class="aq-btn aq-btn-primary" data-act="ok">Copier</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("[data-act='cancel']").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("[data-act='ok']").addEventListener("click", () => {
    const targets = [...overlay.querySelectorAll("input:checked")].map((i) => i.value);
    if (!targets.length) { close(); return; }
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
      injectDuplicateButtons();
      enhanceBlocks();
      document.querySelector(`#main-tabs .tab-btn[data-tab="${srcColor}"]`)?.click();
      highlightActive(srcColor);
      targets.forEach(() => markDirty());
      alert("Épreuve copiée vers " + targets.length + " brigade" + (targets.length > 1 ? "s" : "") + ". Cliquez sur « Publier » pour l'envoyer aux téléphones.");
    }, 60);
  });
}

// ---- Démarrage ---------------------------------------------------------------

function boot() {
  const screenEl = document.getElementById("admin-screen");
  const applyGrid = () => {
    if (screenEl.style.display !== "none" && screenEl.style.display !== "grid") {
      screenEl.style.display = "grid";
    }
  };
  applyGrid();
  new MutationObserver(applyGrid).observe(screenEl, { attributes: true, attributeFilter: ["style"] });

  buildTopbar();
  buildSidebar();
  injectDuplicateButtons();
  enhanceBlocks();

  document.addEventListener("input", (e) => {
    if (e.target.closest("#admin-screen")) markDirty();
  });
  document.addEventListener("change", (e) => {
    if (e.target.closest("#admin-screen")) markDirty();
  });
  document.getElementById("main-tabs")?.addEventListener("click", () => setTimeout(() => highlightActive(), 30));

  const obs = new MutationObserver(() => {
    clearTimeout(window.__aqObsT);
    window.__aqObsT = setTimeout(() => {
      injectDuplicateButtons();
      enhanceBlocks();
    }, 120);
  });
  obs.observe(document.getElementById("team-panels"), { childList: true, subtree: true });
}

const ready = setInterval(() => {
  const screen = document.getElementById("admin-screen");
  if (screen && screen.style.display !== "none" && document.querySelector("#team-panels .tab-panel")) {
    clearInterval(ready);
    boot();
  }
}, 200);
