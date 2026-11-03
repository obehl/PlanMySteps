// Small geo helpers. Coordinates are always {lat, lon} in degrees; distances in metres.
const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bboxAround({ lat, lon }, radiusM) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos(toRad(lat)));
  return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
}

export function inBounds(pt, b) {
  return pt.lat >= b.south && pt.lat <= b.north && pt.lon >= b.west && pt.lon <= b.east;
}

// Ray-casting point-in-polygon. poly: [{lat, lon}, ...]
export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lon, yi = poly[i].lat, xj = poly[j].lon, yj = poly[j].lat;
    if (yi > pt.lat !== yj > pt.lat && pt.lon < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Uniform grid spatial index for fast "what is near this point" lookups.
export class GridIndex {
  constructor(cellDeg = 0.001) {
    this.cell = cellDeg;
    this.cells = new Map();
  }
  key(i, j) { return i + ':' + j; }
  add(item) {
    const i = Math.floor(item.lat / this.cell), j = Math.floor(item.lon / this.cell);
    const k = this.key(i, j);
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k).push(item);
  }
  // Items in the (2r+1)x(2r+1) block of cells around pt.
  around(pt, r = 1) {
    const i0 = Math.floor(pt.lat / this.cell), j0 = Math.floor(pt.lon / this.cell);
    const out = [];
    for (let i = i0 - r; i <= i0 + r; i++)
      for (let j = j0 - r; j <= j0 + r; j++) {
        const c = this.cells.get(this.key(i, j));
        if (c) out.push(...c);
      }
    return out;
  }
  nearest(pt, maxRings = 12) {
    let best = null, bestD = Infinity;
    for (let r = 0; r <= maxRings; r++) {
      // Only scan the ring at distance r (cells already scanned are skipped).
      const i0 = Math.floor(pt.lat / this.cell), j0 = Math.floor(pt.lon / this.cell);
      for (let i = i0 - r; i <= i0 + r; i++)
        for (let j = j0 - r; j <= j0 + r; j++) {
          if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
          const c = this.cells.get(this.key(i, j));
          if (!c) continue;
          for (const it of c) {
            const d = haversine(pt, it);
            if (d < bestD) { bestD = d; best = it; }
          }
        }
      // Once found, one extra ring guarantees correctness at cell borders.
      if (best && r >= 1) {
        const ringM = (r - 1) * this.cell * 111320 * Math.cos(toRad(pt.lat));
        if (bestD <= ringM || r >= maxRings) break;
      }
    }
    return best ? { item: best, dist: bestD } : null;
  }
}
