// Dijkstra routing over the walkability graph with mood-dependent edge costs.
import { MOODS } from './tasks.js';

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

// Cost of walking one edge. A street scoring 0.2 in "calm" mood "feels" 4.2x longer
// than it is, so the planner happily takes a slightly longer quiet lane instead.
export function edgeCost(edge, mood, used) {
  const m = MOODS[mood] || MOODS.explore;
  let c = edge.len * (1 + m.walk * (1 - edge.score));
  if (edge.green) c *= 1 - m.green;
  c *= 1 - m.interest * edge.interest;
  if (used && used.has(edge)) c *= 3; // discourage walking back the same way
  return c;
}

export function dijkstra(graph, source, costFn, target = null) {
  const cost = new Map([[source, 0]]);
  const len = new Map([[source, 0]]);
  const prev = new Map();
  const done = new Set();
  const heap = new MinHeap();
  heap.push(0, source);
  while (heap.size) {
    const [c, x] = heap.pop();
    if (done.has(x)) continue;
    done.add(x);
    if (x === target) break;
    for (const { to, edge } of graph.adj.get(x) || []) {
      if (done.has(to)) continue;
      const nc = c + costFn(edge);
      if (nc < (cost.get(to) ?? Infinity)) {
        cost.set(to, nc);
        len.set(to, len.get(x) + edge.len);
        prev.set(to, { from: x, edge });
        heap.push(nc, to);
      }
    }
  }
  return { cost, len, prev, done };
}

export function shortestPath(graph, a, b, mood, used) {
  if (a === b) return { nodes: [a], edges: [], len: 0 };
  const { prev, done } = dijkstra(graph, a, (e) => edgeCost(e, mood, used), b);
  if (!done.has(b)) return null;
  const nodes = [b], edges = [];
  let x = b;
  while (x !== a) {
    const p = prev.get(x);
    edges.push(p.edge); nodes.push(p.from); x = p.from;
  }
  nodes.reverse(); edges.reverse();
  return { nodes, edges, len: edges.reduce((s, e) => s + e.len, 0) };
}
