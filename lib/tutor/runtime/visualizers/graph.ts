/**
 * Visualizer `graph` (ARCHITECTURE §8, card 2-V3). Chạy trong iframe null-origin: không Node API.
 * SVG dựng bằng `createElementNS`; dữ liệu vào DOM chỉ qua `textContent`/`setAttribute`.
 * State: `{ nodes: { id, label?, x?, y? }[], edges: { from, to, weight?, directed?, kind?, label? }[] }`.
 * Khoá `highlights`: id node, hoặc `"A-B"` cho cạnh (cạnh có hướng: đúng chiều; vô hướng: cả hai chiều).
 * Kind: `active|compare|result|visited|muted` (CSS của shell) và `group-0`…`group-5` (CSS riêng ở đây
 * vì shell chưa có; xem `GROUPS`). Class riêng có tiền tố `wtg-`; chuyển động bằng CSS transition.
 *
 * [Unverified] Chỉ một phần node có toạ độ: coi như không có toạ độ và xếp vòng tròn cho cả đồ thị.
 * [Unverified] `weight` và `label` cùng có: hiện `weight label` trên một dòng (ví dụ `5 3/5`).
 */
import type { VisualizerRenderer } from '@/lib/tutor/protocol/widget-data';
import { isRecord } from '@/lib/tutor/runtime/layout';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 480;
const VIEW_H = 320;
const PAD = 30; // chừa chỗ cho nửa node ngoài cùng và nhãn
const MAX_NODE_RY = 18;
const MIN_NODE_RY = 8;
const CHAR_W = 6.6; // [Inference] bề rộng trung bình một ký tự ở 11px
const MAX_LABEL_CHARS = 14;
const BEND = 24; // độ cong giữa hai cạnh cùng cặp node
const HEAD_LEN = 10;
const HEAD_HALF = 4.5;
const LOOP_H = 36;
const KINDS = new Set(['active', 'compare', 'result', 'visited', 'muted']);

/**
 * Bảng màu `group-0…5`: viền (stroke), nền (fill) và nét đứt riêng từng nhóm để không phân biệt
 * chỉ bằng màu. Viền >= 3:1 với `--wt-bg` của shell (#fff / #111827), có test. Là bản dùng chung
 * mà leader có thể chuyển vào shell.ts; khi đó xoá `groupCss()` khỏi CSS này.
 */
export const GROUPS: readonly {
  light: { stroke: string; fill: string };
  dark: { stroke: string; fill: string };
  dash: string;
}[] = [
  {
    light: { stroke: '#7c3aed', fill: '#ede9fe' },
    dark: { stroke: '#a78bfa', fill: '#4c1d95' },
    dash: 'none',
  },
  {
    light: { stroke: '#0e7490', fill: '#cffafe' },
    dark: { stroke: '#22d3ee', fill: '#164e63' },
    dash: '8 3',
  },
  {
    light: { stroke: '#be185d', fill: '#fce7f3' },
    dark: { stroke: '#f472b6', fill: '#831843' },
    dash: '2 2',
  },
  {
    light: { stroke: '#a16207', fill: '#fef9c3' },
    dark: { stroke: '#facc15', fill: '#713f12' },
    dash: '8 3 2 3',
  },
  {
    light: { stroke: '#047857', fill: '#d1fae5' },
    dark: { stroke: '#34d399', fill: '#064e3b' },
    dash: '4 2 1 2',
  },
  {
    light: { stroke: '#c2410c', fill: '#ffedd5' },
    dark: { stroke: '#fb923c', fill: '#7c2d12' },
    dash: '10 2 2 2 2 2',
  },
];

function groupCss(scheme: 'light' | 'dark'): string {
  return GROUPS.map((g, i) => {
    const c = g[scheme];
    return (
      `.wt-hl-group-${i}{fill:${c.fill};stroke:${c.stroke};stroke-width:3px;stroke-dasharray:${g.dash}}` +
      `.wtg-head.wt-hl-group-${i}{fill:${c.stroke};stroke-width:1px;stroke-dasharray:none}`
    );
  }).join('\n');
}

const CSS = `
.wtg{display:block;inline-size:100%;block-size:auto;direction:ltr}
.wtg text{fill:var(--wt-fg,#1f2937);font:11px/1 system-ui,sans-serif;text-anchor:middle;dominant-baseline:central}
:where(.wtg-shape){fill:var(--wt-bg,#fff);stroke:var(--wt-mut,#6b7280);stroke-width:1.5}
:where(.wtg-line){stroke:var(--wt-mut,#6b7280);stroke-width:1.5}
.wtg path.wtg-line{fill:none}
:where(.wtg-head){fill:var(--wt-mut,#6b7280);stroke:var(--wt-mut,#6b7280);stroke-width:1;stroke-dasharray:none}
.wtg-head.wt-hl-active{fill:var(--wt-k-active,#1d4ed8);stroke-width:1px;stroke-dasharray:none}
.wtg-head.wt-hl-compare{fill:var(--wt-k-compare,#b45309);stroke-width:1px;stroke-dasharray:none}
.wtg-head.wt-hl-result{fill:var(--wt-k-result,#15803d);stroke-width:1px;stroke-dasharray:none}
.wtg-head.wt-hl-visited{fill:var(--wt-k-visited,#4b5563);stroke-width:1px;stroke-dasharray:none}
.wtg-head.wt-hl-muted{fill:var(--wt-k-muted,#6b7280);stroke-width:1px;stroke-dasharray:none}
.wtg-elabel{paint-order:stroke;stroke:var(--wt-bg,#fff);stroke-width:4px;stroke-linejoin:round;font-weight:600}
${groupCss('light')}
@media (prefers-color-scheme:dark){
${groupCss('dark')}
}
.wtg g,.wtg ellipse,.wtg path,.wtg polygon{transition:transform .3s ease,fill .3s,opacity .3s,stroke .3s,stroke-width .3s}
@media (prefers-reduced-motion:reduce){.wtg g,.wtg ellipse,.wtg path,.wtg polygon{transition:none}}
`.trim();

function toNumber(x: unknown): number {
  if (typeof x === 'number') return x;
  return typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
}

// --- bố cục thuần ---

export interface Pt {
  x: number;
  y: number;
}

/**
 * n điểm đều trên đường tròn nội tiếp vùng [0,width] × [0,height] (chừa `pad`), điểm đầu ở đỉnh,
 * đi theo chiều kim đồng hồ. n = 1: tâm; n = 0: rỗng.
 */
export function circleLayout(n: number, width: number, height: number, pad = 0): Pt[] {
  const count = Math.max(0, Math.floor(n));
  const cx = width / 2;
  const cy = height / 2;
  if (count === 0) return [];
  if (count === 1) return [{ x: cx, y: cy }];
  const rx = Math.max(0, width / 2 - pad);
  const ry = Math.max(0, height / 2 - pad);
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

export interface GraphNodeIn {
  id: string;
  label: string;
  x?: number;
  y?: number;
}

export interface NodeBox {
  id: string;
  label: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Nhãn hiển thị của node: `label` nếu có, ngược lại id; cắt quá `MAX_LABEL_CHARS` ký tự. */
export function shownLabel(label: string): string {
  const chars = Array.from(label);
  return chars.length > MAX_LABEL_CHARS
    ? `${chars.slice(0, MAX_LABEL_CHARS - 1).join('')}…`
    : label;
}

/**
 * Vị trí và cỡ node trong vùng [0,width] × [0,height]. Mọi node có toạ độ hữu hạn: co giãn đều
 * (giữ tỉ lệ) vào khung chừa `pad`, canh giữa; ngược lại xếp vòng tròn.
 * Node là elip: `ry` giảm khi đông node, `rx` rộng ra theo độ dài nhãn.
 */
export function layoutNodes(
  nodes: readonly GraphNodeIn[],
  width: number,
  height: number,
  pad = PAD,
): NodeBox[] {
  const n = nodes.length;
  if (n === 0) return [];
  const withXY = nodes.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
  let pts: Pt[];
  let ry = MAX_NODE_RY;
  if (withXY) {
    const xs = nodes.map((v) => v.x as number);
    const ys = nodes.map((v) => v.y as number);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const bw = Math.max(0, width - 2 * pad);
    const bh = Math.max(0, height - 2 * pad);
    const sx = x1 > x0 ? bw / (x1 - x0) : Infinity;
    const sy = y1 > y0 ? bh / (y1 - y0) : Infinity;
    const s = Math.min(sx, sy);
    const k = Number.isFinite(s) ? s : 0;
    pts = nodes.map((v) => ({
      x: width / 2 + ((v.x as number) - (x0 + x1) / 2) * k,
      y: height / 2 + ((v.y as number) - (y0 + y1) / 2) * k,
    }));
    // node không được chồng lên node gần nhất
    let nearest = Infinity;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        nearest = Math.min(nearest, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    if (Number.isFinite(nearest)) ry = Math.min(ry, nearest * 0.4);
  } else {
    pts = circleLayout(n, width, height, pad);
    if (n > 1) {
      const r = Math.min(width, height) / 2 - pad;
      ry = Math.min(ry, 2 * Math.max(r, 1) * Math.sin(Math.PI / n) * 0.4);
    }
  }
  ry = Math.max(MIN_NODE_RY, ry);
  return nodes.map((v, i) => {
    const text = shownLabel(v.label);
    return {
      id: v.id,
      label: text,
      x: pts[i].x,
      y: pts[i].y,
      rx: Math.max(ry, (Array.from(text).length * CHAR_W) / 2 + 6),
      ry,
    };
  });
}

export interface EdgeIn {
  from: string;
  to: string;
  directed: boolean;
  text: string;
}

export interface EdgeGeom {
  /** Thuộc tính `d` của đường (đã dừng ở gốc mũi tên nếu có hướng). */
  d: string;
  /** Điểm giữa đường, chỗ đặt nhãn. */
  mid: Pt;
  /** Đỉnh mũi tên (trên viền node đích) và vector đơn vị hướng tới đó; null nếu vô hướng. */
  head: { tip: Pt; dir: Pt } | null;
}

/** Giao của tia từ tâm node theo hướng (dx,dy) với elip của node. */
function boundary(node: NodeBox, dx: number, dy: number): Pt {
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: node.x, y: node.y };
  const t = 1 / Math.sqrt((dx / node.rx) ** 2 + (dy / node.ry) ** 2);
  return { x: node.x + dx * t, y: node.y + dy * t };
}

const r2 = (x: number) => String(Math.round(x * 100) / 100);

/**
 * Hình học một cạnh. `offset` (px, theo pháp tuyến của hướng chuẩn a→b, a = node có chỉ số nhỏ hơn)
 * làm cong cạnh để các cạnh cùng cặp node không chồng nhau. Cạnh nối node với chính nó vẽ vòng phía trên.
 */
export function edgeGeometry(a: NodeBox, b: NodeBox, directed: boolean, offset: number): EdgeGeom {
  if (a === b) {
    const top = a.y - a.ry;
    const p0 = { x: a.x - 6, y: top };
    const p3 = { x: a.x + 6, y: top };
    const end = directed ? { x: p3.x, y: p3.y - HEAD_LEN } : p3;
    return {
      d: `M${r2(p0.x)} ${r2(p0.y)}C${r2(p0.x - 22)} ${r2(top - LOOP_H)} ${r2(p3.x + 22)} ${r2(top - LOOP_H)} ${r2(end.x)} ${r2(end.y)}`,
      mid: { x: a.x, y: top - LOOP_H * 0.75 },
      head: directed ? { tip: p3, dir: { x: 0, y: 1 } } : null,
    };
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const c: Pt = { x: mx - ((b.y - a.y) / len) * offset, y: my + ((b.x - a.x) / len) * offset };
  const start = boundary(a, c.x - a.x, c.y - a.y);
  const tip = boundary(b, c.x - b.x, c.y - b.y);
  const hl = Math.hypot(tip.x - c.x, tip.y - c.y) || 1;
  const dir = { x: (tip.x - c.x) / hl, y: (tip.y - c.y) / hl };
  const end = directed ? { x: tip.x - dir.x * HEAD_LEN, y: tip.y - dir.y * HEAD_LEN } : tip;
  return {
    d: `M${r2(start.x)} ${r2(start.y)}Q${r2(c.x)} ${r2(c.y)} ${r2(end.x)} ${r2(end.y)}`,
    mid: {
      x: 0.25 * start.x + 0.5 * c.x + 0.25 * tip.x,
      y: 0.25 * start.y + 0.5 * c.y + 0.25 * tip.y,
    },
    head: directed ? { tip, dir } : null,
  };
}

/** Điểm của tam giác mũi tên: đỉnh `tip`, đáy lùi `HEAD_LEN` theo `dir`. */
export function headPoints(tip: Pt, dir: Pt): string {
  const bx = tip.x - dir.x * HEAD_LEN;
  const by = tip.y - dir.y * HEAD_LEN;
  const nx = -dir.y * HEAD_HALF;
  const ny = dir.x * HEAD_HALF;
  return `${r2(tip.x)},${r2(tip.y)} ${r2(bx + nx)},${r2(by + ny)} ${r2(bx - nx)},${r2(by - ny)}`;
}

/**
 * Độ lệch cong của từng cạnh: cạnh duy nhất của một cặp node thì thẳng; k cạnh cùng cặp (kể cả hai
 * chiều ngược nhau) chia đều quanh đường thẳng. Dấu tính theo hướng chuẩn (chỉ số node nhỏ → lớn)
 * nên hai cạnh ngược chiều nằm hai phía.
 */
export function edgeOffsets(
  edges: readonly { from: string; to: string }[],
  order: ReadonlyMap<string, number>,
): number[] {
  const slots = new Map<string, number>();
  const pairKey = (e: { from: string; to: string }) => {
    const [p, q] = [order.get(e.from) ?? 0, order.get(e.to) ?? 0].sort((x, y) => x - y);
    return `${p}:${q}`;
  };
  const totals = new Map<string, number>();
  for (const e of edges) totals.set(pairKey(e), (totals.get(pairKey(e)) ?? 0) + 1);
  return edges.map((e) => {
    const k = pairKey(e);
    const i = slots.get(k) ?? 0;
    slots.set(k, i + 1);
    const total = totals.get(k) ?? 1;
    const sign = (order.get(e.from) ?? 0) <= (order.get(e.to) ?? 0) ? 1 : -1;
    // `|| 0` đổi −0 thành 0
    return sign * (i - (total - 1) / 2) * BEND || 0;
  });
}

export function edgeKey(from: string, to: string): string {
  return `${from}-${to}`;
}

/** Loại tô sáng của cạnh: khoá đúng chiều, hoặc chiều ngược nếu cạnh vô hướng. */
export function edgeKind(
  e: { from: string; to: string; directed: boolean },
  highlights: Readonly<Record<string, unknown>>,
): string | undefined {
  const fwd = highlights[edgeKey(e.from, e.to)];
  const raw = fwd !== undefined || e.directed ? fwd : highlights[edgeKey(e.to, e.from)];
  return knownKind(raw);
}

/** Kind hợp lệ (`active`…`muted`, `group-0`…`group-5`) hoặc undefined. */
export function knownKind(x: unknown): string | undefined {
  if (typeof x !== 'string') return undefined;
  if (KINDS.has(x)) return x;
  return /^group-[0-5]$/.test(x) ? x : undefined;
}

export interface ParsedGraph {
  nodes: GraphNodeIn[];
  edges: EdgeIn[];
}

/** Nhãn cạnh hiển thị: trọng số rồi nhãn, cách nhau một dấu cách; thiếu cả hai thì rỗng. */
export function edgeText(weight: unknown, label: unknown): string {
  const part = (x: unknown) =>
    typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x)) ? String(x) : '';
  return [part(weight), part(label)].filter((s) => s !== '').join(' ');
}

/** Đọc state không tin cậy: bỏ node trùng id, cạnh trỏ tới node không có. */
export function parseGraph(state: unknown): ParsedGraph {
  const s = isRecord(state) ? state : {};
  const nodes: GraphNodeIn[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(s.nodes) ? s.nodes : []) {
    if (!isRecord(raw) || raw.id === undefined || raw.id === null) continue;
    const id = String(raw.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const x = toNumber(raw.x);
    const y = toNumber(raw.y);
    nodes.push({
      id,
      label: raw.label === undefined || raw.label === null ? id : String(raw.label),
      ...(Number.isFinite(x) && Number.isFinite(y) ? { x, y } : {}),
    });
  }
  const edges: EdgeIn[] = [];
  for (const raw of Array.isArray(s.edges) ? s.edges : []) {
    if (!isRecord(raw) || raw.from == null || raw.to == null) continue;
    const from = String(raw.from);
    const to = String(raw.to);
    if (!seen.has(from) || !seen.has(to)) continue;
    edges.push({
      from,
      to,
      directed: raw.directed === true,
      text: edgeText(raw.weight, raw.label),
    });
  }
  return { nodes, edges };
}

/**
 * Mô tả cho trình đọc màn hình: `A (active), B; A→B 3 (result), B–C`. Node trước, dấu `;`, rồi cạnh
 * (`→` có hướng, `–` vô hướng, kèm trọng số/nhãn). Phần trong ngoặc là loại tô sáng nếu có.
 */
export function describeGraph(
  g: ParsedGraph,
  highlights: Readonly<Record<string, unknown>>,
): string {
  const withKind = (text: string, kind: string | undefined) => (kind ? `${text} (${kind})` : text);
  const nodes = g.nodes.map((v) => withKind(v.label, knownKind(highlights[v.id])));
  const label = new Map(g.nodes.map((v) => [v.id, v.label]));
  const edges = g.edges.map((e) => {
    const text = `${label.get(e.from)}${e.directed ? '→' : '–'}${label.get(e.to)}`;
    return withKind(e.text ? `${text} ${e.text}` : text, edgeKind(e, highlights));
  });
  return edges.length > 0 ? `${nodes.join(', ')}; ${edges.join(', ')}` : nodes.join(', ');
}

// --- vẽ ---

interface NodeView {
  g: SVGGElement;
  shape: SVGEllipseElement;
  text: SVGTextElement;
}

interface EdgeView {
  g: SVGGElement;
  line: SVGPathElement;
  head: SVGPolygonElement;
  label: SVGTextElement;
}

interface View {
  host: HTMLElement;
  svg: SVGSVGElement;
  edgeLayer: SVGGElement;
  nodeLayer: SVGGElement;
  labelLayer: SVGGElement;
  nodes: Map<string, NodeView>;
  edges: EdgeView[];
}

let view: View | null = null;

const f = (x: number) => String(Math.round(x * 100) / 100);

function svgEl<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const shapeClass = (base: string, kind: string | undefined) =>
  kind ? `${base} wt-hl-${kind}` : base;

function createNode(v: View, id: string): NodeView {
  const doc = v.host.ownerDocument;
  const g = svgEl(doc, 'g', { class: 'wtg-node', 'data-id': id });
  const shape = svgEl(doc, 'ellipse', { class: 'wtg-shape' });
  const text = svgEl(doc, 'text');
  g.append(shape, text);
  v.nodeLayer.appendChild(g);
  return { g, shape, text };
}

function createEdge(v: View): EdgeView {
  const doc = v.host.ownerDocument;
  const g = svgEl(doc, 'g', { class: 'wtg-edge' });
  const line = svgEl(doc, 'path', { class: 'wtg-line' });
  const head = svgEl(doc, 'polygon', { class: 'wtg-head', display: 'none' });
  g.append(line, head);
  const label = svgEl(doc, 'text', { class: 'wtg-elabel' });
  v.edgeLayer.appendChild(g);
  v.labelLayer.appendChild(label);
  return { g, line, head, label };
}

export const graphVisualizer: VisualizerRenderer = {
  type: 'graph',

  mount(el) {
    const doc = el.ownerDocument;
    const style = doc.createElement('style');
    style.textContent = CSS;
    const svg = svgEl(doc, 'svg', {
      class: 'wtg',
      viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
      role: 'img',
    });
    const edgeLayer = svgEl(doc, 'g');
    const nodeLayer = svgEl(doc, 'g');
    const labelLayer = svgEl(doc, 'g');
    svg.append(edgeLayer, nodeLayer, labelLayer);
    el.replaceChildren(style, svg);
    view = { host: el, svg, edgeLayer, nodeLayer, labelLayer, nodes: new Map(), edges: [] };
  },

  render(frame) {
    const v = view;
    if (!v) return;
    const graph = parseGraph(frame.state);
    const highlights = isRecord(frame.meta?.highlights) ? frame.meta.highlights : {};
    v.svg.setAttribute('aria-label', describeGraph(graph, highlights));

    const boxes = layoutNodes(graph.nodes, VIEW_W, VIEW_H);
    const byId = new Map(boxes.map((b) => [b.id, b]));

    const live = new Set(byId.keys());
    for (const [id, nv] of v.nodes) {
      if (live.has(id)) continue;
      nv.g.remove();
      v.nodes.delete(id);
    }
    for (const box of boxes) {
      let nv = v.nodes.get(box.id);
      if (!nv) {
        nv = createNode(v, box.id);
        v.nodes.set(box.id, nv);
      }
      nv.g.setAttribute('transform', `translate(${f(box.x)} ${f(box.y)})`);
      nv.shape.setAttribute('rx', f(box.rx));
      nv.shape.setAttribute('ry', f(box.ry));
      nv.shape.setAttribute('class', shapeClass('wtg-shape', knownKind(highlights[box.id])));
      nv.text.textContent = box.label;
    }

    while (v.edges.length < graph.edges.length) v.edges.push(createEdge(v));
    for (const ev of v.edges.splice(graph.edges.length)) {
      ev.g.remove();
      ev.label.remove();
    }
    const order = new Map(graph.nodes.map((n, i) => [n.id, i]));
    const offsets = edgeOffsets(graph.edges, order);
    graph.edges.forEach((e, i) => {
      const ev = v.edges[i];
      const a = byId.get(e.from) as NodeBox;
      const b = byId.get(e.to) as NodeBox;
      const geom = edgeGeometry(a, b, e.directed, offsets[i]);
      const kind = edgeKind(e, highlights);
      ev.line.setAttribute('d', geom.d);
      ev.line.setAttribute('class', shapeClass('wtg-line', kind));
      if (geom.head) {
        ev.head.removeAttribute('display');
        ev.head.setAttribute('points', headPoints(geom.head.tip, geom.head.dir));
      } else {
        ev.head.setAttribute('display', 'none');
      }
      ev.head.setAttribute('class', shapeClass('wtg-head', kind));
      ev.label.setAttribute('transform', `translate(${f(geom.mid.x)} ${f(geom.mid.y)})`);
      ev.label.textContent = e.text;
    });
  },

  destroy() {
    view?.host.replaceChildren();
    view = null;
  },
};
