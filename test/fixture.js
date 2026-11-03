// A synthetic 12x12 street grid (~100 m blocks) in Bengaluru-ish coordinates.
// Row 6 is a busy primary road with no footpath; everything else is residential.
// A park covers the north-east corner; a café and a pharmacy sit on the grid.
export const N = 12;
export const LAT0 = 12.97, LON0 = 77.63, STEP = 0.0009; // ~100 m

export const nodeId = (r, c) => r * 100 + c + 1;
export const pos = (r, c) => ({ lat: LAT0 + r * STEP, lon: LON0 + c * STEP });

export function makeOsm({ extraPois = [] } = {}) {
  const elements = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) elements.push({ type: 'node', id: nodeId(r, c), ...pos(r, c) });
  let wid = 1;
  for (let r = 0; r < N; r++) {
    const tags = r === 6
      ? { highway: 'primary', name: 'Busy Main Road', sidewalk: 'no', lanes: '4' }
      : { highway: 'residential', name: `Cross ${r}` };
    elements.push({ type: 'way', id: wid++, nodes: [...Array(N)].map((_, c) => nodeId(r, c)), tags });
  }
  for (let c = 0; c < N; c++)
    elements.push({ type: 'way', id: wid++, nodes: [...Array(N)].map((_, r) => nodeId(r, c)), tags: { highway: 'residential', name: `Main ${c}` } });
  // Motorway that must never be used.
  elements.push({ type: 'way', id: wid++, nodes: [nodeId(0, 0), nodeId(11, 11)], tags: { highway: 'motorway' } });

  const ring = [pos(8.5, 8.5), pos(8.5, 11.5), pos(11.5, 11.5), pos(11.5, 8.5), pos(8.5, 8.5)];
  elements.push({
    type: 'way', id: 9001, tags: { leisure: 'park', name: 'Test Park' }, geometry: ring,
    bounds: { minlat: ring[0].lat, minlon: ring[0].lon, maxlat: ring[2].lat, maxlon: ring[2].lon },
  });
  elements.push({ type: 'node', id: 5001, ...pos(2, 3), tags: { amenity: 'cafe', name: 'Nearby Café' } });
  elements.push({ type: 'node', id: 5002, ...pos(4, 8), tags: { amenity: 'pharmacy', name: 'Test Pharmacy' } });
  for (const p of extraPois) elements.push(p);
  return { elements };
}
