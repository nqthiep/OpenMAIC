/**
 * Flowchart widget: graph JSON in, one self-contained interactive HTML page out.
 *
 * The model names nodes and edges; this module places them, so nodes cannot
 * overlap and edges are routed through free space: between ranks, and down
 * dummy columns for edges that skip a rank.
 *
 * ponytail: layered layout = longest-path ranks + 4 barycentre sweeps, no
 * crossing minimisation beyond that. Fine up to the ~9-node density cap.
 * Upgrade path: dagre-d3-es (already in the lockfile via mermaid) when graphs get wider.
 */

export interface FlowNode {
  id: string;
  label: string;
  icon?: string;
  details?: string;
  type?: 'default' | 'start' | 'end';
  /** Accent treatment. The visual rules allow at most two per diagram. */
  focal?: boolean;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  revealOrder?: string[];
}

export type Direction = 'TB' | 'LR';

export interface Point {
  x: number;
  y: number;
}

export interface PlacedNode extends FlowNode {
  x: number;
  y: number;
  rank: number;
}

export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedEdge extends FlowEdge {
  points: Point[];
  /** Where the label sits; set only for labelled edges. */
  labelBox?: LabelBox;
}

export interface FlowLayout {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}

export const NODE_W = 180;
export const NODE_H = 70;
const GAP_RANK = 60;
const GAP_NODE = 36;
const PAD = 32;
const LINE_H = 18;
const LINE_UNITS = 22; // about 165px of 14px Latin text; CJK and emoji count as two
const MAX_LINES = 2;

/** Dark skin of the editorial style guide (skills/diagram-design, style-guide.md). */
export const PALETTE = {
  bg: '#2d3142',
  panel: '#393e53',
  ink: '#f5f5f5',
  inkStrong: '#111111',
  muted: '#bfc0c0',
  accent: '#f08a59',
} as const;

type Vertex = { rank: number; dummy: boolean };

export function layoutFlow(graph: FlowGraph, direction: Direction = 'TB'): FlowLayout {
  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (ids.has(n.id)) throw new Error(`duplicate node id: ${n.id}`);
    // Layout names its dummy vertices "dummy:<edge>:<rank>"; a real node must not reuse that space.
    if (n.id.startsWith('dummy:')) throw new Error(`node id reserved for layout: ${n.id}`);
    ids.add(n.id);
  }
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      throw new Error(`edge references unknown node: ${e.from} -> ${e.to}`);
    }
    if (e.from === e.to) throw new Error(`self-loop not supported: ${e.from}`);
  }
  if (graph.nodes.length === 0) return { width: 2 * PAD, height: 2 * PAD, nodes: [], edges: [] };

  // 1. Cycles: an edge that closes a loop in a DFS is laid out backwards.
  const outgoing = new Map(graph.nodes.map((n): [string, number[]] => [n.id, []]));
  graph.edges.forEach((e, i) => outgoing.get(e.from)!.push(i));
  const state = new Map<string, 'open' | 'done'>();
  const backward = new Set<number>();
  // Iterative on purpose: a long chain would overflow the call stack with recursion.
  for (const n of graph.nodes) {
    if (state.has(n.id)) continue;
    state.set(n.id, 'open');
    const stack = [{ id: n.id, next: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const out = outgoing.get(top.id)!;
      if (top.next < out.length) {
        const i = out[top.next++];
        const to = graph.edges[i].to;
        const s = state.get(to);
        if (s === 'open') backward.add(i);
        else if (!s) {
          state.set(to, 'open');
          stack.push({ id: to, next: 0 });
        }
      } else {
        state.set(top.id, 'done');
        stack.pop();
      }
    }
  }

  // 2. Ranks: longest path from a source, so every layered edge points one way.
  const layered = graph.edges.map((e, i) =>
    backward.has(i) ? { a: e.to, b: e.from } : { a: e.from, b: e.to },
  );
  const succ = new Map(graph.nodes.map((n): [string, string[]] => [n.id, []]));
  const indegree = new Map(graph.nodes.map((n): [string, number] => [n.id, 0]));
  for (const { a, b } of layered) {
    succ.get(a)!.push(b);
    indegree.set(b, indegree.get(b)! + 1);
  }
  const rank = new Map(graph.nodes.map((n): [string, number] => [n.id, 0]));
  const queue = graph.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  for (let q = 0; q < queue.length; q++) {
    const u = queue[q];
    for (const v of succ.get(u)!) {
      rank.set(v, Math.max(rank.get(v)!, rank.get(u)! + 1));
      indegree.set(v, indegree.get(v)! - 1);
      if (indegree.get(v) === 0) queue.push(v);
    }
  }
  if (queue.length !== graph.nodes.length)
    throw new Error('layout failed: graph still has a cycle');

  // 3. An edge that skips ranks becomes a chain through dummy vertices, one per skipped rank.
  const vertices = new Map<string, Vertex>();
  for (const n of graph.nodes) vertices.set(n.id, { rank: rank.get(n.id)!, dummy: false });
  const above = new Map<string, string[]>();
  const below = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    below.set(from, [...(below.get(from) ?? []), to]);
    above.set(to, [...(above.get(to) ?? []), from]);
  };
  const chains = layered.map(({ a, b }, i) => {
    const chain = [a];
    for (let r = rank.get(a)! + 1; r < rank.get(b)!; r++) {
      const id = `dummy:${i}:${r}`;
      vertices.set(id, { rank: r, dummy: true });
      chain.push(id);
    }
    chain.push(b);
    for (let k = 1; k < chain.length; k++) link(chain[k - 1], chain[k]);
    return chain;
  });

  const maxRank = Math.max(...[...vertices.values()].map((v) => v.rank));
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const [id, v] of vertices) layers[v.rank].push(id);

  // 4. Order within each rank by the barycentre of neighbours, sweeping down then up.
  const index = new Map<string, number>();
  const reindex = (layer: string[]) => layer.forEach((id, i) => index.set(id, i));
  layers.forEach(reindex);
  const sortLayer = (layer: string[], neighbours: Map<string, string[]>) => {
    const key = new Map(
      layer.map((id): [string, number] => {
        const ns = neighbours.get(id) ?? [];
        const value = ns.length
          ? ns.reduce((sum, n) => sum + index.get(n)!, 0) / ns.length
          : index.get(id)!;
        return [id, value];
      }),
    );
    layer.sort((x, y) => key.get(x)! - key.get(y)!);
    reindex(layer);
  };
  for (let pass = 0; pass < 4; pass++) {
    for (let r = 1; r < layers.length; r++) sortLayer(layers[r], above);
    for (let r = layers.length - 2; r >= 0; r--) sortLayer(layers[r], below);
  }

  // 5. Coordinates. Work on the rank axis (main) and the axis within a rank (cross),
  //    then map to x/y for the chosen direction.
  const TB = direction === 'TB';
  const mainSize = TB ? NODE_H : NODE_W;
  const crossSize = TB ? NODE_W : NODE_H;
  const half = mainSize / 2;
  const slot = (id: string) => (vertices.get(id)!.dummy ? 0 : crossSize);
  const rankSpan = layers.map(
    (layer) => layer.reduce((sum, id) => sum + slot(id), 0) + (layer.length - 1) * GAP_NODE,
  );
  const span = Math.max(...rankSpan);
  const cross = new Map<string, number>();
  layers.forEach((layer, r) => {
    let x = (span - rankSpan[r]) / 2;
    for (const id of layer) {
      cross.set(id, x + slot(id) / 2);
      x += slot(id) + GAP_NODE;
    }
  });
  const main = (r: number) => half + r * (mainSize + GAP_RANK);
  const mainSpan = layers.length * mainSize + (layers.length - 1) * GAP_RANK;
  const toXY = (m: number, c: number): Point =>
    TB ? { x: PAD + c, y: PAD + m } : { x: PAD + m, y: PAD + c };
  const at = (id: string): [number, number] => [main(vertices.get(id)!.rank), cross.get(id)!];

  const nodes: PlacedNode[] = graph.nodes.map((n) => {
    const [m, c] = at(n.id);
    return { ...n, rank: rank.get(n.id)!, ...toXY(m, c) };
  });

  // Orthogonal route: leave the source, drop into the gap below its rank, run across,
  // and go down through dummy columns, which are empty by construction.
  // A backward edge runs in a parallel lane so it never coincides with a forward edge between the same nodes.
  const LANE = 12;
  const edges: PlacedEdge[] = graph.edges.map((e, i) => {
    const chain = chains[i];
    const lane = backward.has(i) ? LANE : 0;
    const [m0, c0] = at(chain[0]);
    const pts: Array<[number, number]> = [[m0 + half, c0 + lane]];
    for (let k = 0; k + 1 < chain.length; k++) {
      const [mk, ck] = at(chain[k]);
      const [, ck1] = at(chain[k + 1]);
      const gap = mk + half + GAP_RANK / 2 + lane;
      pts.push([gap, ck + lane], [gap, ck1 + lane]);
    }
    const [mn, cn] = at(chain[chain.length - 1]);
    pts.push([mn - half, cn + lane]);
    const mapped = pts.map(([m, c]) => toXY(m, c));
    return { ...e, points: backward.has(i) ? mapped.reverse() : mapped };
  });

  const width = 2 * PAD + (TB ? span : mainSpan);
  const height = 2 * PAD + (TB ? mainSpan : span);
  placeLabels(edges, nodes, width, height);
  return { width, height, nodes, edges };
}

const LABEL_H = 22;
const LABEL_REACH = 160;

/**
 * Each label starts at the middle of its edge's middle segment, then moves to the nearest spot
 * within LABEL_REACH that clears every node and every label already placed. It stays on the canvas.
 */
function placeLabels(
  edges: PlacedEdge[],
  nodes: PlacedNode[],
  width: number,
  height: number,
): void {
  const obstacles: LabelBox[] = nodes.map((n) => ({
    x: n.x - NODE_W / 2,
    y: n.y - NODE_H / 2,
    w: NODE_W,
    h: NODE_H,
  }));
  const placed: LabelBox[] = [];
  const clear = (a: LabelBox, b: LabelBox) =>
    a.x + a.w + 4 <= b.x || b.x + b.w + 4 <= a.x || a.y + a.h + 4 <= b.y || b.y + b.h + 4 <= a.y;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  // Offsets from the segment middle, nearest first, in 8px steps.
  const steps: Array<[number, number]> = [];
  for (let dx = -LABEL_REACH; dx <= LABEL_REACH; dx += 8) {
    for (let dy = -LABEL_REACH; dy <= LABEL_REACH; dy += 8) steps.push([dx, dy]);
  }
  steps.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]));
  for (const e of edges) {
    if (!e.label) continue;
    const i = Math.floor((e.points.length - 1) / 2);
    const [a, b] = [e.points[i], e.points[i + 1]];
    const w = textUnits(e.label) * 7 + 12;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const at = ([dx, dy]: [number, number]): LabelBox => ({
      x: clamp(cx - w / 2 + dx, 0, width - w),
      y: clamp(cy - LABEL_H / 2 + dy, 0, height - LABEL_H),
      w,
      h: LABEL_H,
    });
    // Nothing clear within reach: keep the middle of the segment, which may touch a neighbour.
    const box =
      steps
        .map(at)
        .find((c) => obstacles.every((o) => clear(o, c)) && placed.every((p) => clear(p, c))) ??
      at([0, 0]);
    placed.push(box);
    e.labelBox = box;
  }
}

// ---- text fitting -----------------------------------------------------------

// CJK, kana, Hangul and emoji are about twice the width of Latin text.
const WIDE = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-｠\u{1F300}-\u{1FAFF}]/u;

export function textUnits(text: string): number {
  let units = 0;
  for (const ch of text) units += WIDE.test(ch) ? 2 : 1;
  return units;
}

/** Cut text to `max` units, reserving one unit for the ellipsis. */
function clip(text: string, max: number): string {
  if (textUnits(text) <= max) return text;
  let out = '';
  let units = 0;
  for (const ch of text) {
    const w = WIDE.test(ch) ? 2 : 1;
    if (units + w > max - 1) break;
    out += ch;
    units += w;
  }
  return `${out}…`;
}

function splitByUnits(word: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (const ch of word) {
    if (textUnits(current + ch) > LINE_UNITS) {
      parts.push(current);
      current = '';
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

/** Greedy word wrap into at most MAX_LINES lines; overflow ends in an ellipsis. */
export function wrapLabel(text: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    splitByUnits(word).forEach((piece, i) => {
      if (i > 0) {
        // The rest of a word too long for one line (CJK runs have no spaces).
        lines.push(line);
        line = piece;
        return;
      }
      const joined = line ? `${line} ${piece}` : piece;
      if (textUnits(joined) <= LINE_UNITS) line = joined;
      else {
        lines.push(line);
        line = piece;
      }
    });
  }
  if (line) lines.push(line);
  if (lines.length > MAX_LINES) {
    lines.length = MAX_LINES;
    lines[MAX_LINES - 1] = clip(`${lines[MAX_LINES - 1]}…`, LINE_UNITS);
  }
  return lines.length ? lines : [''];
}

// ---- HTML ---------------------------------------------------------------------

export interface RenderOptions {
  title?: string;
  lang?: string;
  direction?: Direction;
  labels?: { prev: string; next: string };
}

export function renderFlowHtml(graph: FlowGraph, options: RenderOptions = {}): string {
  const layout = layoutFlow(graph, options.direction);
  const edgeIds = edgeDomIds(layout.edges);
  const known = new Set(graph.nodes.map((n) => n.id));
  for (const id of graph.revealOrder ?? []) {
    if (!known.has(id)) throw new Error(`revealOrder references unknown node: ${id}`);
  }
  const byPosition = [...layout.nodes]
    .sort((a, b) => a.rank - b.rank || a.x - b.x || a.y - b.y)
    .map((n) => n.id);
  const order = [...new Set([...(graph.revealOrder ?? []), ...byPosition])];
  const config = { type: 'diagram', nodes: graph.nodes, edges: graph.edges, revealOrder: order };
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  const title = options.title ?? 'Diagram';
  const labels = options.labels ?? { prev: 'Back', next: 'Next' };

  return `<!DOCTYPE html>
<html lang="${esc(options.lang ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main class="frame">
  <h1>${esc(title)}</h1>
  <div class="stage">
    <svg viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-labelledby="diagram-title diagram-desc">
      <title id="diagram-title">${esc(title)}</title>
      <desc id="diagram-desc">${graph.nodes.length} steps, ${graph.edges.length} connections.</desc>
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow-head" d="M0,0 L10,5 L0,10 z"/></marker></defs>
      <g class="edges">${layout.edges.map((e, i) => renderEdge(e, edgeIds[i])).join('')}</g>
      <g class="nodes">${layout.nodes.map(renderNode).join('')}</g>
    </svg>
  </div>
  <nav class="controls">
    <button id="prev" type="button">${esc(labels.prev)}</button>
    <span id="step" aria-live="polite"></span>
    <button id="next" type="button">${esc(labels.next)}</button>
  </nav>
  <aside id="details" hidden><h2></h2><p></p><button id="close" type="button" aria-label="Close">×</button></aside>
</main>
<script type="application/json" id="widget-config">${json}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

function renderNode(n: PlacedNode): string {
  const lines = wrapLabel(n.icon ? `${n.icon} ${n.label}` : n.label);
  const rx = n.type === 'start' || n.type === 'end' ? NODE_H / 2 : 10;
  const cls = ['node', n.focal ? 'focal' : '', n.type && n.type !== 'default' ? n.type : '']
    .filter(Boolean)
    .join(' ');
  const spans = lines
    .map((line, i) => {
      const dy = i === 0 ? -((lines.length - 1) * LINE_H) / 2 : LINE_H;
      return `<tspan x="0" dy="${dy}">${esc(line)}</tspan>`;
    })
    .join('');
  return `<g id="node-${esc(n.id)}" class="${cls}" data-node="${esc(n.id)}" tabindex="0" transform="translate(${round(n.x)} ${round(n.y)})"><g class="node-body"><rect x="${-NODE_W / 2}" y="${-NODE_H / 2}" width="${NODE_W}" height="${NODE_H}" rx="${rx}"/><text text-anchor="middle" dominant-baseline="middle">${spans}</text></g></g>`;
}

/** Edge ids follow the template's "edge-{from}-{to}"; a repeated pair gets a numeric suffix so ids stay unique. */
function edgeDomIds(edges: PlacedEdge[]): string[] {
  const seen = new Map<string, number>();
  return edges.map((e) => {
    const base = `edge-${e.from}-${e.to}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}

function renderEdge(e: PlacedEdge, domId: string): string {
  const d = e.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ');
  const label = e.label && e.labelBox ? renderEdgeLabel(e.label, e.labelBox) : '';
  return `<g class="edge" id="${esc(domId)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"><path d="${d}" marker-end="url(#arrow)"/>${label}</g>`;
}

function renderEdgeLabel(label: string, box: LabelBox): string {
  const { x, y, w, h } = box;
  return `<g class="edge-label"><rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${h}" rx="6"/><text x="${round(x + w / 2)}" y="${round(y + h / 2)}" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text></g>`;
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSS = `
:root { --bg: ${PALETTE.bg}; --panel: ${PALETTE.panel}; --ink: ${PALETTE.ink}; --ink-strong: ${PALETTE.inkStrong}; --muted: ${PALETTE.muted}; --accent: ${PALETTE.accent}; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
.frame { max-width: 960px; margin: 0 auto; padding: 16px; }
h1 { margin: 0 0 12px; font-size: 18px; font-weight: 600; }
.stage { overflow-x: auto; background: var(--panel); border-radius: 12px; padding: 8px; }
svg { display: block; width: 100%; min-width: 560px; height: auto; }
.node { cursor: pointer; transition: opacity 0.25s; }
.node .node-body rect { fill: var(--ink); }
.node text { fill: var(--ink-strong); font-size: 14px; }
.node.focal .node-body rect { fill: var(--accent); }
.node:focus { outline: none; }
.node:focus-visible .node-body rect { stroke: var(--accent); stroke-width: 3; }
.edge { transition: opacity 0.25s; }
.edge path { fill: none; stroke: var(--muted); stroke-width: 1.75; stroke-linejoin: round; }
.arrow-head { fill: var(--muted); }
.edge-label rect { fill: var(--bg); }
.edge-label text { fill: var(--ink); font-size: 12px; }
.hidden { opacity: 0; pointer-events: none; }
.dim { opacity: 0.35; }
.highlight .node-body rect, .highlight path { stroke: var(--accent); stroke-width: 3; }
.controls { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; }
button { font: inherit; color: var(--ink); background: transparent; border: 1px solid rgba(245, 245, 245, 0.2); border-radius: 8px; padding: 6px 14px; cursor: pointer; }
button:disabled { opacity: 0.4; cursor: default; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
#details { position: relative; margin-top: 12px; padding: 12px 40px 12px 14px; border-radius: 10px; background: var(--panel); border: 1px solid rgba(245, 245, 245, 0.12); }
#details[hidden] { display: none; }
#details h2 { margin: 0 0 4px; font-size: 15px; }
#details p { margin: 0; }
#close { position: absolute; top: 8px; right: 8px; padding: 2px 8px; }
.teacher-annotation { position: fixed; z-index: 10; max-width: 280px; padding: 6px 10px; border-radius: 8px; background: var(--accent); color: var(--ink-strong); font-size: 13px; }
@media (prefers-reduced-motion: reduce) { .node, .edge { transition: none; } }
`;

// Platform contract: SET_WIDGET_STATE, HIGHLIGHT_ELEMENT, ANNOTATE_ELEMENT and REVEAL_ELEMENT
// (see packages/@openmaic/generation/templates/diagram-content/system.md).
const SCRIPT = `
(function () {
  var config = JSON.parse(document.getElementById('widget-config').textContent);
  var order = config.revealOrder;
  var byId = {};
  config.nodes.forEach(function (n) { byId[n.id] = n; });
  var nodeEls = {};
  document.querySelectorAll('.node').forEach(function (el) { nodeEls[el.dataset.node] = el; });
  var edgeEls = Array.prototype.slice.call(document.querySelectorAll('.edge'));
  var prev = document.getElementById('prev');
  var next = document.getElementById('next');
  var counter = document.getElementById('step');
  var details = document.getElementById('details');
  var step = 1;

  function render() {
    var shown = {};
    order.slice(0, step).forEach(function (id) { shown[id] = true; });
    Object.keys(nodeEls).forEach(function (id) { nodeEls[id].classList.toggle('hidden', !shown[id]); });
    edgeEls.forEach(function (el) {
      el.classList.toggle('hidden', !(shown[el.dataset.from] && shown[el.dataset.to]));
    });
    counter.textContent = step + ' / ' + order.length;
    prev.disabled = step <= 1;
    next.disabled = step >= order.length;
  }

  function showDetails(id) {
    var node = byId[id];
    if (!node) return;
    details.querySelector('h2').textContent = node.label;
    details.querySelector('p').textContent = node.details || '';
    details.hidden = false;
  }

  Object.keys(nodeEls).forEach(function (id) {
    var el = nodeEls[id];
    el.addEventListener('click', function () { showDetails(id); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetails(id); }
    });
  });
  document.getElementById('close').addEventListener('click', function () { details.hidden = true; });
  prev.addEventListener('click', function () { step = Math.max(1, step - 1); render(); });
  next.addEventListener('click', function () { step = Math.min(order.length, step + 1); render(); });

  function find(selector) {
    try { return document.querySelector(selector); } catch (err) { return null; }
  }

  window.addEventListener('message', function (event) {
    // The platform host is the only sender; ignore messages from any other frame.
    if (event.source !== window.parent) return;
    var data = event.data || {};
    if (data.type === 'SET_WIDGET_STATE' && data.state) {
      Object.keys(data.state).forEach(function (id) {
        if (nodeEls[id]) nodeEls[id].classList.toggle('dim', !data.state[id]);
      });
    } else if (data.type === 'HIGHLIGHT_ELEMENT') {
      var target = find(data.target);
      if (target) {
        target.classList.add('highlight');
        setTimeout(function () { target.classList.remove('highlight'); }, 3000);
      }
    } else if (data.type === 'ANNOTATE_ELEMENT') {
      var anchor = find(data.target);
      if (anchor && data.content) {
        var rect = anchor.getBoundingClientRect();
        var tip = document.createElement('div');
        tip.className = 'teacher-annotation';
        tip.textContent = data.content;
        tip.style.top = Math.max(0, rect.top - 40) + 'px';
        tip.style.left = Math.max(0, rect.left) + 'px';
        document.body.appendChild(tip);
        setTimeout(function () { tip.remove(); }, 4000);
      }
    } else if (data.type === 'REVEAL_ELEMENT') {
      var hiddenEl = find(data.target);
      if (hiddenEl) hiddenEl.classList.remove('hidden');
    }
  });

  render();
})();
`;
