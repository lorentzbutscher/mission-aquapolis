// Wrapper Leaflet — nécessite que le script Leaflet (variable globale L)
// soit chargé au préalable via une balise <script> dans la page HTML.

export function createMap(elId, center, zoom = 15) {
  const map = L.map(elId, { zoomControl: true }).setView(center, zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; contributeurs OpenStreetMap",
  }).addTo(map);
  return map;
}

function markerHtml({ color = "#ffd12e", imgUrl, emoji = "📍", big = false }) {
  const imgTag = imgUrl
    ? `<img src="${imgUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
    : "";
  return (
    `<div class="aq-marker${big ? " convergence" : ""}" style="--marker-color:${color}">` +
    imgTag +
    `<span class="aq-marker-emoji" style="display:${imgUrl ? "none" : "flex"}">${emoji}</span></div>`
  );
}

export function addCustomMarker(map, lat, lng, opts = {}) {
  const size = opts.big ? 50 : 42;
  const icon = L.divIcon({
    html: markerHtml(opts),
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4],
  });
  const marker = L.marker([lat, lng], { icon }).addTo(map);
  if (opts.label) marker.bindPopup(opts.label);
  return marker;
}

export function fitToMarkers(map, latLngs, padding = 60) {
  if (!latLngs.length) return;
  const bounds = L.latLngBounds(latLngs);
  map.fitBounds(bounds, { padding: [padding, padding], maxZoom: 17 });
}

export function locateUser(map, onFound) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      L.circleMarker([latitude, longitude], {
        radius: 8,
        color: "#3b82f6",
        fillColor: "#60a5fa",
        fillOpacity: 0.9,
        weight: 3,
      }).addTo(map);
      if (onFound) onFound(latitude, longitude);
    },
    () => {},
    { enableHighAccuracy: true, timeout: 8000 }
  );
}
