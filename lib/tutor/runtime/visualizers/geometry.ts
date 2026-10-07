/**
 * Visualizer `geometry` (ARCHITECTURE §8; task 3B-V1): điểm, đoạn, đường thẳng, đường tròn, góc trên mặt
 * phẳng toạ độ (trục y hướng lên). Chạy trong iframe null-origin: không Node API. SVG dựng bằng
 * `createElementNS`; dữ liệu vào DOM chỉ qua `textContent`/`setAttribute`.
 * State: `{ bounds, points, segments?, lines?, circles?, angles? }`. Khoá `highlights` là id của đối tượng
 * (điểm, đoạn, đường thẳng, đường tròn, góc); id nên khác nhau giữa các loại.
 * Kind: `active|compare|result|visited|muted` (lớp `wt-hl-*` của shell) và `group-0..5` (lớp `wtx-g0..5`,
 * cùng bảng màu và mẫu nét với `grid`, nên không phân biệt chỉ bằng màu).
 * Giới hạn: 40 điểm, 60 đoạn, 12 đường thẳng, 12 đường tròn, 12 góc (phần thừa bị bỏ); nhãn cắt ở 8 ký tự.
 */
import type { VisualizerRenderer } from '@/lib/tutor/protocol/widget-data';
import { GROUP_PALETTE, clip } from '@/lib/tutor/runtime/visualizers/grid';
import { isRecord } from '@/lib/tutor/runtime/layout';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MAX_POINTS = 40;
export const MAX_SEGMENTS = 60;
export const MAX_LINES = 12;
export const MAX_CIRCLES = 12;
export const MAX_ANGLES = 12;
export const MAX_LABEL = 8;
const VIEW_W = 480;
const VIEW_H_MIN = 160;
const VIEW_H_MAX = 420;
const PAD = 22;
const ARC_R = 16;
const SHELL_KINDS = ['active', 'compare', 'result', 'visited', 'muted'];
const KINDS = new Set([...SHELL_KINDS, ...Array.from({ length: 6 }, (_, i) => `group-${i}`)]);

const groupRules = (scheme: 'light' | 'dark') =>
  GROUP_PALETTE.map(
    (g, i) =>
      `.wtx-g${i}{fill:${g[scheme].fill};stroke:${g[scheme].stroke};stroke-width:${g.width}px;stroke-dasharray:${g.dash}}`,
  ).join('');

const CSS = `
.wtx{display:block;inline-size:100%;block-size:auto;direction:ltr}
.wtx text{fill:var(--wt-fg,#1f2937);font:12px/1 system-ui,sans-serif;dominant-baseline:central}
.wtx text.wtx-angle{text-anchor:middle;fill:var(--wt-mut,#6b7280)}
:where(.wtx-pt){fill:var(--wt-fg,#1f2937);stroke:var(--wt-bg,#fff);stroke-width:1.5}
:where(.wtx-seg,.wtx-line){stroke:var(--wt-fg,#1f2937);stroke-width:2;fill:none}
:where(.wtx-dashed){stroke-dasharray:6 4}
:where(.wtx-circle){stroke:var(--wt-fg,#1f2937);stroke-width:2;fill:none}
:where(.wtx-arc){stroke:var(--wt-mut,#6b7280);stroke-width:1.5;fill:none}
/* a highlighted line, arc or circle outline must not be filled (the shell's wt-hl-* kinds set a fill); a group colour may */
.wtx line,.wtx path.wtx-arc,.wtx circle.wtx-circle:not([class*=wtx-g]){fill:none}
.wtx-g0,.wtx-g1,.wtx-g2,.wtx-g3,.wtx-g4,.wtx-g5{fill-opacity:.35}
${groupRules('light')}
@media (prefers-color-scheme:dark){${groupRules('dark')}}
`.trim();

// --- giá trị ---

function num(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : NaN;
}

function str(x: unknown): string | null {
  return typeof x === 'string' && x !== '' ? x : null;
}

export interface Bounds {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

/** Khung toạ độ hợp lệ; thiếu, sai kiểu hoặc suy biến (max <= min) thì dùng [0,10]×[0,10]. */
export function parseBounds(raw: unknown): Bounds {
  const o = isRecord(raw) ? raw : {};
  const b = { xmin: num(o.xmin), xmax: num(o.xmax), ymin: num(o.ymin), ymax: num(o.ymax) };
  const ok = b.xmax > b.xmin && b.ymax > b.ymin; // NaN so sánh luôn sai
  return ok ? b : { xmin: 0, xmax: 10, ymin: 0, ymax: 10 };
}

// --- bố cục thuần ---

export interface Screen {
  /** Toạ độ màn hình của điểm thế giới (y hướng lên). */
  sx(x: number): number;
  sy(y: number): number;
  /** Số pixel trên một đơn vị thế giới (cùng tỉ lệ hai trục). */
  scale: number;
}

/**
 * Ánh xạ khung `bounds` vào vùng `[0,width]×[0,height]`, giữ tỉ lệ (một đơn vị x và y dài như nhau), căn giữa;
 * y thế giới tăng thì y màn hình giảm. Khung suy biến dùng khung mặc định; vùng không dương cho `scale` 0.
 */
export function toScreen(bounds: unknown, width: number, height: number): Screen {
  const b = parseBounds(bounds);
  const w = Math.max(width, 0);
  const h = Math.max(height, 0);
  const scale = Math.min(w / (b.xmax - b.xmin), h / (b.ymax - b.ymin));
  const ox = (w - (b.xmax - b.xmin) * scale) / 2;
  const oy = (h - (b.ymax - b.ymin) * scale) / 2;
  return {
    sx: (x) => ox + (x - b.xmin) * scale,
    sy: (y) => h - oy - (y - b.ymin) * scale,
    scale,
  };
}

export interface Pt {
  x: number;
  y: number;
}

/**
 * Đường thẳng qua `p` và `q` (toạ độ thế giới) cắt khung `bounds`: hai đầu mút trên mép khung, hoặc `null`
 * khi p = q, toạ độ không hữu hạn, hoặc đường không đi qua khung.
 */
export function clipLine(p: Pt, q: Pt, bounds: Bounds): [Pt, Pt] | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  if (![p.x, p.y, q.x, q.y].every(Number.isFinite) || (dx === 0 && dy === 0)) return null;
  // tham số t của p + t·(dx, dy) trong khung: giao các khoảng theo từng trục
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [d, lo, hi, s] of [
    [dx, bounds.xmin, bounds.xmax, p.x],
    [dy, bounds.ymin, bounds.ymax, p.y],
  ] as const) {
    if (d === 0) {
      if (s < lo || s > hi) return null;
      continue;
    }
    const a = (lo - s) / d;
    const b = (hi - s) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (!(t0 <= t1)) return null;
  return [
    { x: p.x + t0 * dx, y: p.y + t0 * dy },
    { x: p.x + t1 * dx, y: p.y + t1 * dy },
  ];
}

export interface AngleArc {
  /** Đường cung `M … A …` (toạ độ màn hình), cung nhỏ giữa hai tia. */
  path: string;
  /** Vị trí nhãn (trên phân giác, xa đỉnh hơn cung). */
  lx: number;
  ly: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Cung góc tại đỉnh màn hình `at` giữa hai tia hướng tới `from` và `to` (toạ độ màn hình), bán kính `radius`.
 * `null` khi một tia có độ dài 0 hoặc hai tia thẳng hàng (góc 0° hoặc 180°: không có cung để vẽ).
 */
export function angleArc(at: Pt, from: Pt, to: Pt, radius = ARC_R): AngleArc | null {
  const a1 = Math.atan2(from.y - at.y, from.x - at.x);
  const a2 = Math.atan2(to.y - at.y, to.x - at.x);
  if (![a1, a2].every(Number.isFinite) || (from.x === at.x && from.y === at.y)) return null;
  if (to.x === at.x && to.y === at.y) return null;
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  if (Math.abs(d) < 1e-6 || Math.abs(Math.abs(d) - Math.PI) < 1e-6) return null;
  const p1 = { x: at.x + radius * Math.cos(a1), y: at.y + radius * Math.sin(a1) };
  const p2 = { x: at.x + radius * Math.cos(a1 + d), y: at.y + radius * Math.sin(a1 + d) };
  const sweep = d > 0 ? 1 : 0; // trục y màn hình hướng xuống: d > 0 là chiều kim đồng hồ
  const mid = a1 + d / 2;
  return {
    path: `M${r2(p1.x)} ${r2(p1.y)}A${radius} ${radius} 0 0 ${sweep} ${r2(p2.x)} ${r2(p2.y)}`,
    lx: at.x + (radius + 12) * Math.cos(mid),
    ly: at.y + (radius + 12) * Math.sin(mid),
  };
}

// --- đọc state ---

interface PointObj {
  id: string;
  x: number;
  y: number;
  label: string;
}

function list(x: unknown, max: number): Record<string, unknown>[] {
  return Array.isArray(x) ? x.filter(isRecord).slice(0, max) : [];
}

/** Điểm hợp lệ (id chuỗi không rỗng, x/y hữu hạn, id không trùng), tối đa `MAX_POINTS`. */
export function readPoints(raw: unknown): PointObj[] {
  const out: PointObj[] = [];
  const seen = new Set<string>();
  for (const p of list(raw, MAX_POINTS * 2)) {
    const id = str(p.id);
    const x = num(p.x);
    const y = num(p.y);
    if (!id || seen.has(id) || Number.isNaN(x) || Number.isNaN(y)) continue;
    seen.add(id);
    out.push({ id, x, y, label: clip(typeof p.label === 'string' ? p.label : id, MAX_LABEL) });
    if (out.length >= MAX_POINTS) break;
  }
  return out;
}

/** Mô tả cho trình đọc màn hình: đối tượng theo loại, id kèm loại tô sáng nếu có. */
export function describeGeometry(
  counts: Readonly<{
    points: PointObj[];
    segments: string[];
    lines: string[];
    circles: string[];
    angles: string[];
  }>,
  highlights: Readonly<Record<string, unknown>>,
): string {
  const tag = (id: string) => {
    const k = highlights[id];
    return typeof k === 'string' && KINDS.has(k) ? `${id} (${k})` : id;
  };
  const parts: string[] = [];
  if (counts.points.length) {
    parts.push(
      `points: ${counts.points.map((p) => `${tag(p.id)} (${r2(p.x)}, ${r2(p.y)})`).join(', ')}`,
    );
  }
  for (const k of ['segments', 'lines', 'circles', 'angles'] as const) {
    if (counts[k].length) parts.push(`${k}: ${counts[k].map(tag).join(', ')}`);
  }
  return parts.join('; ');
}

// --- vẽ ---

interface View {
  host: HTMLElement;
  svg: SVGSVGElement;
  layer: SVGGElement;
}

let view: View | null = null;

const f = (x: number) => String(r2(x));

function svgEl<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function kindClass(base: string, kind: unknown): string {
  if (typeof kind !== 'string' || !KINDS.has(kind)) return base;
  return kind.startsWith('group-') ? `${base} wtx-g${kind.slice(6)}` : `${base} wt-hl-${kind}`;
}

export const geometryVisualizer: VisualizerRenderer = {
  type: 'geometry',

  mount(el) {
    const doc = el.ownerDocument;
    const style = doc.createElement('style');
    style.textContent = CSS;
    const svg = svgEl(doc, 'svg', {
      class: 'wtx',
      viewBox: `0 0 ${VIEW_W} ${VIEW_H_MIN}`,
      role: 'img',
    });
    const layer = svgEl(doc, 'g');
    svg.appendChild(layer);
    el.replaceChildren(style, svg);
    view = { host: el, svg, layer };
  },

  render(frame) {
    const v = view;
    if (!v) return;
    const doc = v.host.ownerDocument;
    const state = isRecord(frame.state) ? frame.state : {};
    const hl = isRecord(frame.meta?.highlights) ? frame.meta.highlights : {};
    const bounds = parseBounds(state.bounds);
    const aspect = (bounds.ymax - bounds.ymin) / (bounds.xmax - bounds.xmin);
    const viewH = Math.min(Math.max(VIEW_W * aspect + 2 * PAD, VIEW_H_MIN), VIEW_H_MAX);
    const scr = toScreen(bounds, VIEW_W - 2 * PAD, viewH - 2 * PAD);
    const X = (x: number) => PAD + scr.sx(x);
    const Y = (y: number) => PAD + scr.sy(y);

    const points = readPoints(state.points);
    const byId = new Map(points.map((p) => [p.id, p]));
    const segments = list(state.segments, MAX_SEGMENTS).filter((s) => str(s.id));
    const lines = list(state.lines, MAX_LINES).filter((s) => str(s.id));
    const circles = list(state.circles, MAX_CIRCLES).filter((s) => str(s.id));
    const angles = list(state.angles, MAX_ANGLES).filter((s) => str(s.id));

    const drawn = {
      segments: [] as string[],
      lines: [] as string[],
      circles: [] as string[],
      angles: [] as string[],
    };
    const under = svgEl(doc, 'g');
    const over = svgEl(doc, 'g');
    const add = (g: SVGGElement, el: SVGElement) => g.appendChild(el);

    for (const c of circles) {
      const center = byId.get(String(c.center));
      const r = num(c.r);
      if (!center || !(r > 0)) continue;
      drawn.circles.push(String(c.id));
      add(
        under,
        svgEl(doc, 'circle', {
          class: kindClass('wtx-circle', hl[String(c.id)]),
          cx: f(X(center.x)),
          cy: f(Y(center.y)),
          r: f(r * scr.scale),
        }),
      );
    }
    for (const l of lines) {
      const through = Array.isArray(l.through) ? l.through : [];
      const p = byId.get(String(through[0]));
      const q = byId.get(String(through[1]));
      const seg = p && q ? clipLine(p, q, bounds) : null;
      if (!seg) continue;
      drawn.lines.push(String(l.id));
      add(
        under,
        svgEl(doc, 'line', {
          class: kindClass('wtx-line', hl[String(l.id)]),
          x1: f(X(seg[0].x)),
          y1: f(Y(seg[0].y)),
          x2: f(X(seg[1].x)),
          y2: f(Y(seg[1].y)),
        }),
      );
    }
    for (const s of segments) {
      const p = byId.get(String(s.from));
      const q = byId.get(String(s.to));
      if (!p || !q) continue;
      drawn.segments.push(String(s.id));
      add(
        under,
        svgEl(doc, 'line', {
          class: kindClass(s.dashed === true ? 'wtx-seg wtx-dashed' : 'wtx-seg', hl[String(s.id)]),
          x1: f(X(p.x)),
          y1: f(Y(p.y)),
          x2: f(X(q.x)),
          y2: f(Y(q.y)),
        }),
      );
    }
    for (const a of angles) {
      const at = byId.get(String(a.at));
      const from = byId.get(String(a.from));
      const to = byId.get(String(a.to));
      if (!at || !from || !to) continue;
      const arc = angleArc(
        { x: X(at.x), y: Y(at.y) },
        { x: X(from.x), y: Y(from.y) },
        { x: X(to.x), y: Y(to.y) },
      );
      if (!arc) continue;
      drawn.angles.push(String(a.id));
      add(
        under,
        svgEl(doc, 'path', { class: kindClass('wtx-arc', hl[String(a.id)]), d: arc.path }),
      );
      if (typeof a.label === 'string' && a.label !== '') {
        const t = svgEl(doc, 'text', { class: 'wtx-angle', x: f(arc.lx), y: f(arc.ly) });
        t.textContent = clip(a.label, MAX_LABEL);
        add(over, t);
      }
    }
    for (const p of points) {
      add(
        over,
        svgEl(doc, 'circle', {
          class: kindClass('wtx-pt', hl[p.id]),
          cx: f(X(p.x)),
          cy: f(Y(p.y)),
          r: '4.5',
        }),
      );
      const t = svgEl(doc, 'text', { x: f(X(p.x) + 8), y: f(Y(p.y) - 8) });
      t.textContent = p.label;
      add(over, t);
    }

    v.svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${f(viewH)}`);
    v.svg.setAttribute(
      'aria-label',
      describeGeometry(
        {
          points,
          ...drawn,
        },
        hl,
      ),
    );
    v.layer.replaceChildren(under, over);
  },

  destroy() {
    view?.host.replaceChildren();
    view = null;
  },
};
