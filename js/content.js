// Chargement du contenu du jeu : local d'abord (toujours disponible, même
// hors-ligne), puis mise à jour discrète en arrière-plan depuis Firestore
// si l'admin a configuré Firebase et modifié du contenu.
import { fetchContentFromCloud, configured } from "./sync.js";

const LOCAL_CACHE_KEY = "aquapolis_content_cache_v1";
const CONTENT_URL = "./content.json";

function readCache() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(content) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(content));
  } catch {}
}

async function fetchBundledFile() {
  try {
    const res = await fetch(CONTENT_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("content.json introuvable");
    return await res.json();
  } catch (err) {
    console.warn("[content] échec chargement content.json", err);
    return null;
  }
}

export async function loadContent() {
  let content = readCache();
  if (!content) {
    content = await fetchBundledFile();
    if (content) writeCache(content);
  }
  if (configured) {
    refreshFromCloud().catch(() => {});
  }
  return content;
}

async function refreshFromCloud() {
  const cloud = await fetchContentFromCloud();
  if (!cloud) return;
  const current = readCache() || {};
  const merged = {
    config: cloud.config || current.config,
    finalEpreuve: cloud.finalEpreuve || current.finalEpreuve,
    teams: { ...(current.teams || {}), ...(cloud.teams || {}) },
  };
  writeCache(merged);
  window.dispatchEvent(new CustomEvent("aquapolis:content-updated", { detail: merged }));
}

export function getCachedContent() {
  return readCache();
}
