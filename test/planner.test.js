import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../src/graph.js';
import { planWalk, googleMapsUrl } from '../src/planner.js';
import { shortestPath } from '../src/route.js';
import { scoreWay } from '../src/score.js';
import { makeOsm, nodeId, pos } from './fixture.js';

const graph = buildGraph(makeOsm());

test('scoreWay ranks Indian road classes sensibly', () => {
  const lane = scoreWay({ highway: 'residential' }).score;
  const arterial = scoreWay({ highway: 'primary', sidewalk: 'no' }).score;
  const arterialWithFootpath = scoreWay({ highway: 'primary', sidewalk: 'both' }).score;
  assert.ok(lane > arterialWithFootpath && arterialWithFootpath > arterial);
  assert.equal(scoreWay({ highway: 'motorway' }).excluded, true);
  assert.equal(scoreWay({ highway: 'footway', access: 'private' }).excluded, true);
});

test('graph excludes motorways and marks park edges green', () => {
  assert.ok(![...graph.ways.values()].some((w) => w.tags.highway === 'motorway'));
  assert.ok(graph.edges.some((e) => e.green));
  assert.ok(graph.pois.some((p) => p.tags.leisure === 'park'));
});

test('calm mood avoids walking along the busy road', () => {
  // From one end of row 6 to the other: errands mode may use it, calm must not.
  const a = nodeId(6, 0), b = nodeId(6, 11);
  const calm = shortestPath(graph, a, b, 'calm');
  const busyCalm = calm.edges.filter((e) => e.way.tags.highway === 'primary').length;
  assert.ok(busyCalm <= 2, `calm route used ${busyCalm} primary edges`);
});

test('loop walk hits step goal within ~20% and returns home', () => {
  const start = pos(1, 1);
  for (const mood of ['calm', 'explore', 'errands']) {
    const plan = planWalk(graph, { start, mood, targetSteps: 5000 });
    const ratio = plan.steps / 5000;
    assert.ok(ratio > 0.8 && ratio < 1.25, `${mood}: ${plan.steps} steps`);
    assert.deepEqual(plan.coords[0], plan.coords[plan.coords.length - 1]);
  }
});

test('errands are included as stops', () => {
  const plan = planWalk(graph, { start: pos(1, 1), mood: 'errands', tasks: ['chai', 'pharmacy'], targetSteps: 4000 });
  assert.deepEqual(plan.stops.map((s) => s.name).sort(), ['Nearby Café', 'Test Pharmacy']);
  assert.ok(plan.googleMapsUrl.includes('travelmode=walking'));
});

test('missing errand produces a friendly note, not a crash', () => {
  const plan = planWalk(graph, { start: pos(1, 1), tasks: ['post'], targetSteps: 3000 });
  assert.ok(plan.notes.some((n) => n.includes('post office')));
});

test('sponsored partner wins at a comparable distance', () => {
  const sponsors = [{ id: 's1', name: 'Partner Café', category: 'chai', lat: pos(1, 4).lat, lon: pos(1, 4).lon, offer: '10% off' }];
  const plan = planWalk(graph, { start: pos(1, 1), mood: 'errands', tasks: ['chai'], targetSteps: 3000, sponsors });
  assert.equal(plan.stops[0].name, 'Partner Café');
  assert.equal(plan.stops[0].sponsored, true);
});

test('sponsored partner does NOT win when much further away', () => {
  const sponsors = [{ id: 's2', name: 'Far Café', category: 'chai', lat: pos(10, 10).lat, lon: pos(10, 10).lon, offer: '10% off' }];
  const plan = planWalk(graph, { start: pos(1, 1), mood: 'errands', tasks: ['chai'], targetSteps: 6000, sponsors });
  assert.equal(plan.stops[0].name, 'Nearby Café');
});

test('Google Maps URL has at most 9 waypoints', () => {
  const plan = planWalk(graph, { start: pos(1, 1), tasks: ['chai', 'pharmacy', 'park'], targetSteps: 8000 });
  const wps = new URL(plan.googleMapsUrl).searchParams.get('waypoints');
  assert.ok(wps.split('|').length <= 9);
});
