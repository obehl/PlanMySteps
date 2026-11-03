// Builds a walkable street graph from an Overpass (OpenStreetMap) JSON response.
import { haversine, pointInPolygon, GridIndex } from './geo.js';
import { scoreWay } from './score.js';

const PARK_LEISURE = new Set(['park', 'garden', 'nature_reserve']);
const PARK_LANDUSE = new Set(['recreation_ground', 'forest', 'village_green']);
const isParkTags = (t) => PARK_LEISURE.has(t.leisure) || PARK_LANDUSE.has(t.landuse);

function boundsOf(points) {
  const b = { south: Infinity, west: Infinity, north: -Infinity, east: -Infinity };
  for (const p of points) {
    b.south = Math.min(b.south, p.lat); b.north = Math.max(b.north, p.lat);
    b.west = Math.min(b.west, p.lon); b.east = Math.max(b.east, p.lon);
  }
  return b;
}

export function buildGraph(osm) {
  const coords = new Map();
  for (const el of osm.elements) {
    if (el.type === 'node' && el.lat != null) coords.set(el.id, { lat: el.lat, lon: el.lon });
  }

  const roadWays = new Map();
  const pois = new Map();
  const parks = [];
  for (const el of osm.elements) {
    const t = el.tags || {};
    if (el.type === 'way' && t.highway && el.nodes) {
      roadWays.set(el.id, el);
    } else if ((el.type === 'way' || el.type === 'relation') && isParkTags(t) && el.bounds) {
      const ring = el.type === 'way' && el.geometry ? el.geometry : null;
      const bounds = {
        south: el.bounds.minlat, west: el.bounds.minlon,
        north: el.bounds.maxlat, east: el.bounds.maxlon,
      };
      const park = {
        id: el.type + '/' + el.id, name: t.name || t['name:en'] || 'Park', ring, bounds,
        lat: (bounds.south + bounds.north) / 2, lon: (bounds.west + bounds.east) / 2,
      };
      parks.push(park);
      if (PARK_LEISURE.has(t.leisure)) {
        pois.set(park.id, { id: park.id, name: park.name, tags: { leisure: t.leisure }, lat: park.lat, lon: park.lon });
      }
    }
    if (t.amenity || t.shop) {
      const pos = el.type === 'node' ? { lat: el.lat, lon: el.lon } : el.center;
      if (pos && pos.lat != null) {
        const id = el.type + '/' + el.id;
        pois.set(id, { id, name: t.name || t['name:en'] || null, tags: t, lat: pos.lat, lon: pos.lon });
      }
    }
  }

  const poiIndex = new GridIndex(0.0005); // ~55 m cells
  for (const p of pois.values()) poiIndex.add(p);

  const inPark = (pt) =>
    parks.some(
      (p) =>
        pt.lat >= p.bounds.south && pt.lat <= p.bounds.north &&
        pt.lon >= p.bounds.west && pt.lon <= p.bounds.east &&
        (!p.ring || pointInPolygon(pt, p.ring)),
    );

  const nodes = new Map(); // id -> {id, lat, lon}
  const adj = new Map(); // id -> [{to, edge}]
  const ways = new Map();
  const edges = [];

  for (const w of roadWays.values()) {
    const s = scoreWay(w.tags);
    if (s.excluded) continue;
    const way = {
      id: w.id, tags: w.tags, name: w.tags.name || w.tags['name:en'] || null,
      score: s.score, reasons: s.reasons, nodeIds: w.nodes,
    };
    ways.set(w.id, way);
    for (let i = 0; i + 1 < w.nodes.length; i++) {
      const a = w.nodes[i], b = w.nodes[i + 1];
      const ca = coords.get(a), cb = coords.get(b);
      if (!ca || !cb) continue;
      const mid = { lat: (ca.lat + cb.lat) / 2, lon: (ca.lon + cb.lon) / 2 };
      const poiCount = poiIndex.around(mid, 1).length;
      const edge = {
        a, b, way, len: haversine(ca, cb), score: s.score,
        green: inPark(mid) || w.tags.leisure === 'park',
        interest: Math.min(poiCount, 8) / 8,
      };
      edges.push(edge);
      for (const [x, y, c] of [[a, b, ca], [b, a, cb]]) {
        if (!nodes.has(x)) nodes.set(x, { id: x, lat: c.lat, lon: c.lon });
        if (!adj.has(x)) adj.set(x, []);
        adj.get(x).push({ to: y, edge });
      }
    }
  }

  // Keep only the largest connected component for snapping, so a start point
  // never lands on an isolated fragment (e.g. a footway inside a gated campus).
  const comp = new Map();
  let bestComp = -1, bestSize = 0, cid = 0;
  for (const id of nodes.keys()) {
    if (comp.has(id)) continue;
    let size = 0;
    const stack = [id];
    comp.set(id, cid);
    while (stack.length) {
      const x = stack.pop();
      size++;
      for (const { to } of adj.get(x) || []) {
        if (!comp.has(to)) { comp.set(to, cid); stack.push(to); }
      }
    }
    if (size > bestSize) { bestSize = size; bestComp = cid; }
    cid++;
  }
  const nodeIndex = new GridIndex(0.001);
  for (const n of nodes.values()) if (comp.get(n.id) === bestComp) nodeIndex.add(n);

  return {
    nodes, adj, ways, edges, parks,
    pois: [...pois.values()],
    // Nearest node in the main walkable network, or null if nothing within ~1.3 km.
    snap(pt, maxDistM = 400) {
      const r = nodeIndex.nearest(pt);
      return r && r.dist <= maxDistM ? r.item.id : null;
    },
  };
}
