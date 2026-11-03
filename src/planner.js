// Plans a loop walk: start -> errands -> (scenic detours to hit the step goal) -> start.
import { haversine } from './geo.js';
import { TASKS, MOODS } from './tasks.js';
import { dijkstra, edgeCost, shortestPath } from './route.js';
import { scoreColor } from './score.js';

const SPONSOR_PREFERENCE = 0.75; // a sponsored stop may be up to ~33% "further" and still win
const WALK_SPEED_M_PER_MIN = 75; // ~4.5 km/h, unhurried

function routeThrough(graph, waypoints, mood) {
  const used = new Set();
  const nodes = [waypoints[0]], edges = [];
  const skipped = [];
  let from = waypoints[0];
  for (let i = 1; i < waypoints.length; i++) {
    const leg = shortestPath(graph, from, waypoints[i], mood, used);
    if (!leg) { skipped.push(waypoints[i]); continue; }
    for (const e of leg.edges) used.add(e);
    nodes.push(...leg.nodes.slice(1));
    edges.push(...leg.edges);
    from = waypoints[i];
  }
  return { nodes, edges, len: edges.reduce((s, e) => s + e.len, 0), skipped };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nodeQuality(graph, id, mood) {
  const m = MOODS[mood] || MOODS.explore;
  const adj = graph.adj.get(id) || [];
  if (!adj.length) return 0;
  let q = 0;
  for (const { edge } of adj) {
    q += edge.score + (edge.green ? m.green * 1.5 : 0) + edge.interest * m.interest * 1.5;
  }
  return q / adj.length;
}

export function planWalk(graph, opts) {
  const {
    start, mood = 'explore', tasks = [], targetSteps = 6000, strideM = 0.75, sponsors = [],
    variant = 0, // >0 gives a different (still good) loop each time: "show me another walk"
  } = opts;
  const rand = mulberry32(variant);
  const targetM = targetSteps * strideM;
  const notes = [];

  const s = graph.snap(start);
  if (s == null) throw new Error('No walkable streets found near this point. Try moving the start pin.');
  const fromStart = dijkstra(graph, s, (e) => edgeCost(e, mood));
  const reachLimit = Math.max(targetM * 0.5, 500);

  // 1. Pick a place for every errand: the best walkability-weighted option, with a
  //    gentle preference for sponsored partners (never enough to drag you down a highway).
  const candidates = [
    ...graph.pois.map((p) => ({ ...p, sponsored: false })),
    ...sponsors.map((sp) => ({
      id: 'sponsor:' + sp.id, name: sp.name, category: sp.category, lat: sp.lat, lon: sp.lon,
      sponsored: true, offer: sp.offer, demo: !!sp.demo, tags: {},
    })),
  ];
  const stops = [];
  for (const task of tasks) {
    const def = TASKS[task];
    if (!def) continue;
    let best = null;
    for (const p of candidates) {
      const matches = p.sponsored ? p.category === task : def.match(p.tags);
      if (!matches || haversine(start, p) > reachLimit) continue;
      const node = graph.snap(p, 150);
      if (node == null) continue;
      const c = fromStart.cost.get(node);
      if (c == null || fromStart.len.get(node) > reachLimit) continue;
      const eff = c * (p.sponsored ? SPONSOR_PREFERENCE : 1);
      if (!best || eff < best.eff) best = { ...p, node, eff, task };
    }
    if (best) stops.push(best);
    else notes.push(`Couldn't find ${def.label.toLowerCase()} within walking range.`);
  }

  // 2. Order errands greedily (nearest next), as a loop from home.
  const ordered = [];
  let cur = start;
  const left = [...stops];
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++)
      if (haversine(cur, left[i]) < haversine(cur, left[bi])) bi = i;
    cur = left[bi];
    ordered.push(left.splice(bi, 1)[0]);
  }

  let waypoints = [s, ...ordered.map((x) => x.node), s];
  let route = routeThrough(graph, waypoints, mood);
  let best = { route, waypoints };

  // 3. Too short for the step goal? Insert scenic detour points (parks when calm,
  //    lively streets when curious) until we land within ~15% of the target.
  if (route.len < 0.85 * targetM) {
    const pool = [];
    for (const [id, l] of fromStart.len) {
      if (l < 150 || l > targetM * 0.55) continue;
      pool.push({ id, ...graph.nodes.get(id), quality: nodeQuality(graph, id, mood) });
    }
    pool.sort((a, b) => b.quality - a.quality);
    const shortlist = pool.slice(0, Math.max(300, Math.floor(pool.length * 0.25)));
    const detourNodes = new Set();

    for (let iter = 0; iter < 5 && route.len < 0.85 * targetM && shortlist.length; iter++) {
      const remaining = targetM - route.len;
      let choice = null;
      for (const x of shortlist) {
        if (detourNodes.has(x.id)) continue;
        for (let i = 0; i + 1 < waypoints.length; i++) {
          const A = graph.nodes.get(waypoints[i]), B = graph.nodes.get(waypoints[i + 1]);
          const delta = 1.3 * (haversine(A, x) + haversine(x, B) - haversine(A, B));
          const fit = Math.abs(delta - remaining) / remaining;
          const value = fit - 0.25 * x.quality + (variant ? rand() * 0.35 : 0);
          if (!choice || value < choice.value) choice = { x, i, value };
        }
      }
      if (!choice) break;
      detourNodes.add(choice.x.id);
      waypoints = [...waypoints.slice(0, choice.i + 1), choice.x.id, ...waypoints.slice(choice.i + 1)];
      route = routeThrough(graph, waypoints, mood);
      if (Math.abs(route.len - targetM) < Math.abs(best.route.len - targetM)) best = { route, waypoints };
      if (route.len > 1.2 * targetM) break;
    }
    route = best.route;
    waypoints = best.waypoints;
    if (route.len < 0.7 * targetM) notes.push('The walkable network around here is small, so this loop is shorter than your goal. Try another start point.');
  } else if (route.len > 1.25 * targetM) {
    notes.push('Your errands need more steps than your goal. Nice bonus, or drop an errand.');
  }

  return summarise(graph, route, ordered, start, strideM, notes);
}

function summarise(graph, route, stops, start, strideM, notes) {
  // Colour-coded segments (merge consecutive edges of the same colour).
  const segments = [];
  for (let i = 0; i < route.edges.length; i++) {
    const e = route.edges[i];
    const a = graph.nodes.get(route.nodes[i]), b = graph.nodes.get(route.nodes[i + 1]);
    const color = scoreColor(e.score);
    const last = segments[segments.length - 1];
    if (last && last.color === color) last.coords.push([b.lat, b.lon]);
    else segments.push({ color, score: e.score, coords: [[a.lat, a.lon], [b.lat, b.lon]] });
  }

  let weighted = 0;
  const busy = new Map();
  for (const e of route.edges) {
    weighted += e.len * e.score;
    if (e.score < 0.3) {
      const k = e.way.name || 'an unnamed main road';
      busy.set(k, (busy.get(k) || 0) + e.len);
    }
  }
  const warnings = [...busy]
    .filter(([, m]) => m >= 60)
    .map(([name, m]) => `About ${Math.round(m / 10) * 10} m along ${name}: busy road, stay alert.`);

  const len = route.len;
  return {
    lengthM: len,
    steps: Math.round(len / strideM),
    minutes: Math.round(len / WALK_SPEED_M_PER_MIN),
    walkability: len ? weighted / len : 0,
    greenShare: len ? route.edges.filter((e) => e.green).reduce((s, e) => s + e.len, 0) / len : 0,
    segments,
    coords: route.nodes.map((id) => { const n = graph.nodes.get(id); return [n.lat, n.lon]; }),
    stops: stops.map(({ id, name, task, lat, lon, sponsored, offer, demo }) => ({
      id, name: name || TASKS[task].label, task, lat, lon, sponsored, offer, demo,
    })),
    warnings,
    notes,
    googleMapsUrl: googleMapsUrl(start, stops, route, graph),
  };
}

// Google Maps re-routes on its own, so we pin the shape of our loop with
// "via" waypoints sampled along the route (max 9 waypoints in a Maps URL).
export function googleMapsUrl(start, stops, route, graph) {
  const fmt = (p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  const pts = route.nodes.map((id) => graph.nodes.get(id));
  const maxVia = Math.max(0, 9 - stops.length);
  const via = [];
  if (pts.length > 2 && maxVia > 0) {
    for (let k = 1; k <= maxVia; k++) via.push({ ...pts[Math.floor((k * (pts.length - 1)) / (maxVia + 1))], at: k / (maxVia + 1) });
  }
  // Put errands in their route order, interleaved with via points.
  const stopPos = stops.map((s) => {
    let bi = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = haversine(p, s); if (d < bd) { bd = d; bi = i; } });
    return { ...s, at: bi / Math.max(1, pts.length - 1) };
  });
  const wps = [...via, ...stopPos].sort((a, b) => a.at - b.at).slice(0, 9).map(fmt);
  const params = new URLSearchParams({
    api: '1', origin: fmt(start), destination: fmt(start), travelmode: 'walking',
  });
  if (wps.length) params.set('waypoints', wps.join('|'));
  return 'https://www.google.com/maps/dir/?' + params.toString();
}
