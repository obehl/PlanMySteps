import { fetchArea, geocode } from './osm.js';
import { buildGraph } from './graph.js';
import { planWalk } from './planner.js';
import { TASKS, MOODS } from './tasks.js';
import { haversine } from './geo.js';
import { scoreColor, scoreLabel } from './score.js';

const $ = (id) => document.getElementById(id);
const state = { start: null, mood: 'explore', tasks: new Set(), area: null, variant: 0, plan: null };
let sponsors = [];
fetch('data/sponsors.json').then((r) => r.json()).then((s) => (sponsors = s)).catch(() => {});

// ---------- Map ----------
const map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([12.9716, 77.5946], 13);
L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© OpenStreetMap contributors',
}).addTo(map);
const startIcon = L.divIcon({ className: '', html: '<div style="font-size:28px;transform:translate(-8px,-26px)">📍</div>' });
let startMarker = null;
const routeLayer = L.layerGroup().addTo(map);
const streetsLayer = L.layerGroup();

map.on('click', (e) => setStart({ lat: e.latlng.lat, lon: e.latlng.lng }));

function setStart(pt, zoom) {
  state.start = pt;
  state.variant = 0;
  if (startMarker) startMarker.setLatLng([pt.lat, pt.lon]);
  else startMarker = L.marker([pt.lat, pt.lon], { icon: startIcon, draggable: true }).addTo(map)
    .on('dragend', (e) => setStart({ lat: e.target.getLatLng().lat, lon: e.target.getLatLng().lng }));
  if (zoom) map.setView([pt.lat, pt.lon], zoom, { animate: false });
  $('plan').disabled = false;
  $('plan').textContent = 'Plan my walk';
}

// ---------- Controls ----------
for (const [key, m] of Object.entries(MOODS)) {
  const b = document.createElement('button');
  b.type = 'button'; b.setAttribute('role', 'radio');
  b.textContent = `${m.emoji} ${m.label}`;
  b.setAttribute('aria-checked', key === state.mood);
  b.onclick = () => {
    state.mood = key;
    for (const x of $('moods').children) x.setAttribute('aria-checked', x === b);
    $('mood-blurb').textContent = m.blurb;
  };
  $('moods').append(b);
}
$('mood-blurb').textContent = MOODS[state.mood].blurb;

for (const [key, t] of Object.entries(TASKS)) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = `${t.emoji} ${t.label}`;
  b.setAttribute('aria-pressed', 'false');
  b.onclick = () => {
    state.tasks.has(key) ? state.tasks.delete(key) : state.tasks.add(key);
    b.setAttribute('aria-pressed', state.tasks.has(key));
  };
  $('tasks').append(b);
}

$('steps').oninput = () => ($('steps-out').textContent = (+$('steps').value).toLocaleString('en-IN'));

$('search').onsubmit = async (e) => {
  e.preventDefault();
  const q = $('q').value.trim();
  if (!q) return;
  status('Searching…');
  try { const hit = await geocode(q); setStart(hit, 16); status(''); }
  catch (err) { status(err.message); }
};

$('locate').onclick = () => {
  if (!navigator.geolocation) return status('Location is not available in this browser.');
  status('Finding you…');
  navigator.geolocation.getCurrentPosition(
    (p) => { setStart({ lat: p.coords.latitude, lon: p.coords.longitude }, 16); status(''); },
    () => status('Could not get your location. Tap the map instead.'),
    { enableHighAccuracy: true, timeout: 10000 },
  );
};

$('plan').onclick = () => { state.variant = 0; plan(); };
$('r-again').onclick = () => { state.variant++; plan(); };
$('layer').onchange = () => toggleStreets();

for (const b of document.querySelectorAll('[data-rate]')) {
  b.onclick = () => {
    // Stored locally for now; this becomes the crowd-sourced walkability dataset once there's a backend.
    try {
      const all = JSON.parse(localStorage.getItem('pms.ratings') || '[]');
      all.push({ at: new Date().toISOString(), rating: b.dataset.rate, start: state.start, mood: state.mood, coords: state.plan?.coords });
      localStorage.setItem('pms.ratings', JSON.stringify(all));
    } catch {}
    status(b.dataset.rate === 'up' ? 'Thanks! Glad you enjoyed it. 🙌' : 'Thanks, we\'ll use this to improve routes.');
  };
}

// ---------- Planning ----------
async function ensureArea(targetM) {
  const radius = Math.min(3000, Math.max(800, targetM * 0.45));
  const a = state.area;
  if (a && haversine(a.center, state.start) + radius <= a.radius) return a.graph;
  status('Loading streets around you from OpenStreetMap… (first time can take ~20 s)');
  const loadRadius = radius + 300; // a little slack so small pin moves don't refetch
  const osm = await fetchArea(state.start, loadRadius);
  const graph = buildGraph(osm);
  state.area = { center: state.start, radius: loadRadius, graph };
  if ($('layer').checked) toggleStreets();
  return graph;
}

async function plan() {
  if (!state.start) return;
  const targetSteps = +$('steps').value;
  $('plan').disabled = true;
  try {
    const graph = await ensureArea(targetSteps * 0.75);
    status('Planning your walk…');
    await new Promise((r) => setTimeout(r, 0));
    const p = planWalk(graph, {
      start: state.start, mood: state.mood, tasks: [...state.tasks], targetSteps, sponsors, variant: state.variant,
    });
    state.plan = p;
    render(p);
    status('');
  } catch (err) {
    console.error(err);
    status(err.message);
  } finally {
    $('plan').disabled = false;
  }
}

function render(p) {
  routeLayer.clearLayers();
  for (const s of p.segments) {
    L.polyline(s.coords, { color: '#fff', weight: 9, opacity: 0.9 }).addTo(routeLayer);
    L.polyline(s.coords, { color: s.color, weight: 6 }).bindTooltip(scoreLabel(s.score)).addTo(routeLayer);
  }
  p.stops.forEach((s, i) => {
    const icon = L.divIcon({ className: '', html: `<div class="stop-pin">${TASKS[s.task].emoji}</div>` });
    L.marker([s.lat, s.lon], { icon }).bindPopup(`<b>${i + 1}. ${esc(s.name)}</b>${s.sponsored ? '<br><i>Sponsored partner</i>' : ''}${s.offer ? `<br>${esc(s.offer)}` : ''}`).addTo(routeLayer);
  });

  $('r-steps').textContent = p.steps.toLocaleString('en-IN');
  $('r-km').textContent = (p.lengthM / 1000).toFixed(1);
  $('r-min').textContent = p.minutes;
  $('r-walk').textContent = Math.round(p.walkability * 100) + '%';
  $('r-stops').innerHTML = p.stops.map((s) =>
    `<li>${TASKS[s.task].emoji} ${esc(s.name)}${s.sponsored ? ` <span class="badge">${s.demo ? 'Sponsored · demo' : 'Sponsored'}</span>` : ''}${s.offer ? `<span class="offer">🎁 ${esc(s.offer)}</span>` : ''}</li>`,
  ).join('');
  const greenNote = p.greenShare > 0.05 ? [`🌳 ${Math.round(p.greenShare * 100)}% of this walk is through greenery.`] : [];
  $('r-notes').innerHTML = [
    ...p.warnings.map((w) => `<li class="warn">⚠️ ${esc(w)}</li>`),
    ...[...greenNote, ...p.notes].map((n) => `<li>${esc(n)}</li>`),
  ].join('');
  $('r-gmaps').href = p.googleMapsUrl;
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (p.coords.length > 1) {
    // Keep the route clear of the panel: it sits on the left (desktop) or bottom (mobile).
    const r = $('panel').getBoundingClientRect();
    const mobile = r.width >= window.innerWidth - 1;
    map.fitBounds(L.latLngBounds(p.coords), mobile
      ? { paddingTopLeft: [30, 30], paddingBottomRight: [30, r.height + 30], animate: false }
      : { paddingTopLeft: [r.right + 30, 30], paddingBottomRight: [30, 30], animate: false });
  }
}

function toggleStreets() {
  streetsLayer.clearLayers();
  if (!$('layer').checked) return map.removeLayer(streetsLayer);
  const g = state.area?.graph;
  if (!g) { status('Plan a walk first to load street data.'); return; }
  for (const w of g.ways.values()) {
    const pts = w.nodeIds.map((id) => g.nodes.get(id)).filter(Boolean).map((n) => [n.lat, n.lon]);
    if (pts.length < 2) continue;
    L.polyline(pts, { color: scoreColor(w.score), weight: 3, opacity: 0.75 })
      .bindTooltip(`<b>${esc(w.name || 'Unnamed street')}</b><br>${scoreLabel(w.score)} (${Math.round(w.score * 100)})<br><small>${w.reasons.map(esc).join(' · ')}</small>`)
      .addTo(streetsLayer);
  }
  streetsLayer.addTo(map);
  routeLayer.eachLayer((l) => l.bringToFront?.());
}

function status(msg) { $('status').textContent = msg; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

// Deep link: ?start=12.97,77.64 drops the pin straight away.
const qs = new URLSearchParams(location.search).get('start');
if (qs) { const [lat, lon] = qs.split(',').map(Number); if (!isNaN(lat) && !isNaN(lon)) setStart({ lat, lon }, 16); }
