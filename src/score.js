// Walkability score for a single OpenStreetMap way, 0 (avoid) .. 1 (lovely).
//
// India-specific reasoning: the road *class* is the strongest predictor we have.
// Arterial roads (trunk/primary/secondary) often lack usable footpaths, carry
// fast traffic and are hard to cross, while residential lanes, gullies and
// colony roads are usually pleasant even without a formal sidewalk.
// Footpath tags are rare in Indian OSM data, so they act as a bonus, not a requirement.

export const ROAD_BASE = {
  pedestrian: 1.0,
  footway: 0.95,
  living_street: 0.95,
  path: 0.85,
  residential: 0.8,
  cycleway: 0.7,
  track: 0.6,
  steps: 0.6,
  service: 0.65,
  unclassified: 0.6,
  road: 0.5,
  tertiary: 0.45,
  tertiary_link: 0.4,
  secondary: 0.28,
  secondary_link: 0.25,
  primary: 0.15,
  primary_link: 0.12,
  trunk: 0.05,
  trunk_link: 0.05,
};

const NEVER_WALK = new Set([
  'motorway', 'motorway_link', 'construction', 'proposed', 'raceway',
  'bus_guideway', 'busway', 'escape', 'platform', 'corridor', 'elevator', 'via_ferrata',
]);

const BAD_SURFACE = new Set(['dirt', 'mud', 'sand', 'earth', 'ground', 'gravel', 'unpaved', 'grass']);

export function scoreWay(tags = {}) {
  const hw = tags.highway;
  if (!hw || NEVER_WALK.has(hw)) return { excluded: true };
  if (tags.foot === 'no' || tags.access === 'private' || tags.access === 'no') {
    if (tags.foot !== 'yes' && tags.foot !== 'designated') return { excluded: true };
  }
  if (tags.area === 'yes' && hw !== 'pedestrian') return { excluded: true };

  const reasons = [];
  let s = ROAD_BASE[hw] ?? 0.5;
  reasons.push(`${hw.replace(/_/g, ' ')} road`);

  const isMajor = s < 0.5;
  const sw = tags.sidewalk ?? tags['sidewalk:both'] ?? tags['sidewalk:left'] ?? tags['sidewalk:right'];
  if (['both', 'left', 'right', 'yes'].includes(sw)) {
    s += isMajor ? 0.3 : 0.1;
    reasons.push('has footpath');
  } else if (sw === 'separate') {
    // A separately mapped footway runs alongside; the footway itself will be preferred.
    s += 0.1;
    reasons.push('separate footpath nearby');
  } else if (sw === 'no' || sw === 'none') {
    s -= isMajor ? 0.1 : 0.05;
    reasons.push('no footpath');
  }

  if (tags.foot === 'designated') { s += 0.1; reasons.push('designated for walking'); }
  if (tags.lit === 'yes') { s += 0.05; reasons.push('lit at night'); }
  if (BAD_SURFACE.has(tags.surface)) { s -= 0.1; reasons.push('unpaved surface'); }

  const speed = parseInt(tags.maxspeed, 10);
  if (speed >= 60) { s -= 0.1; reasons.push(`fast traffic (${speed} km/h)`); }
  const lanes = parseInt(tags.lanes, 10);
  if (lanes >= 4) { s -= 0.08; reasons.push(`${lanes} lanes`); }
  if (tags.junction === 'roundabout') { s -= 0.05; reasons.push('roundabout'); }

  s = Math.max(0.02, Math.min(1, s));
  return { excluded: false, score: s, reasons };
}

export function scoreLabel(s) {
  if (s >= 0.7) return 'Great for walking';
  if (s >= 0.45) return 'Okay';
  if (s >= 0.25) return 'Busy road – stay alert';
  return 'Avoid on foot';
}

export function scoreColor(s) {
  if (s >= 0.7) return '#1a9850';
  if (s >= 0.45) return '#a6d96a';
  if (s >= 0.25) return '#fdae61';
  return '#d73027';
}
