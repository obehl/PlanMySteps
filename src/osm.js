// Fetches streets, shops/amenities and parks around a point from OpenStreetMap (Overpass API).
import { bboxAround } from './geo.js';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export function overpassQuery(b) {
  const bb = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:90][bbox:${bb}];
way["highway"];
out body;
>;
out skel qt;
(nwr["amenity"];nwr["shop"];);
out center;
(way["leisure"~"^(park|garden|nature_reserve)$"];relation["leisure"~"^(park|garden)$"];way["landuse"~"^(recreation_ground|forest|village_green)$"];);
out geom;`;
}

export async function fetchArea(center, radiusM) {
  const q = overpassQuery(bboxAround(center, radiusM));
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return await res.json();
    } catch (e) { lastErr = e; }
  }
  throw new Error('Could not load map data from OpenStreetMap (' + lastErr.message + '). Please try again in a minute.');
}

export async function geocode(query) {
  const url = 'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({ q: query, format: 'json', limit: '1', countrycodes: 'in' });
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const [hit] = await res.json();
  if (!hit) throw new Error(`Couldn't find “${query}”.`);
  return { lat: +hit.lat, lon: +hit.lon, label: hit.display_name };
}
