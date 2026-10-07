/**
 * Visualizer `functionPlotter` (ARCHITECTURE §8; task 3B-V2): đồ thị hàm số từ các điểm đã tính sẵn.
 * KHÔNG nhận biểu thức, không parser, không `eval`: `run()` của entry tính điểm mẫu, visualizer chỉ nối chúng.
 * Chạy trong iframe null-origin: không Node API. SVG dựng bằng `createElementNS`; dữ liệu vào DOM chỉ qua
 * `textContent`/`setAttribute`.
 * State: `{ bounds, curves:{id, points:[x,y][]}[], marks?:{id,x,y,label}[], vlines?:{id,x,label?}[] }`.
 * Khoá `highlights` là id của đường, điểm đánh dấu hoặc đường thẳng đứng. Kind: `active|compare|result|visited|
 * muted` (lớp `wt-hl-*` của shell) và `group-0..5` (lớp `wtp-g0..5`, cùng bảng màu với `grid`). Đường thứ i của
 * state có mẫu nét riêng (không phân biệt chỉ bằng màu).
 * Giới hạn: 4 đường × 200 điểm, 12 điểm đánh dấu, 6 đường thẳng đứng; nhãn cắt ở 8 ký tự.
 * Đường bị cắt ở mép khung; điểm không hữu hạn ngắt đường (hàm không xác định tại đó).
 */
import type { VisualizerRenderer } from '@/lib/tutor/protocol/widget-data';
import { isRecord } from '@/lib/tutor/runtime/layout';
import { GROUP_PALETTE, clip } from '@/lib/tutor/runtime/visualizers/grid';
import { parseBounds, type Bounds } from '@/lib/tutor/runtime/visualizers/geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MAX_CURVES = 4;
export const MAX_CURVE_POINTS = 200;
export const MAX_MARKS = 12;
export const MAX_VLINES = 6;
export const MAX_LABEL = 8;
const VIEW_W = 480;
const VIEW_H = 300;
const PAD = { left: 44, right: 14, top: 14, bottom: 28 };
const CURVE_DASH = ['none', '9 4', '2 4', '9 3 2 3'];
const SHELL_KINDS = ['active', 'compare', 'result', 'visited', 'muted'];
const KINDS = new Set([...SHELL_KINDS, ...Array.from({ length: 6 }, (_, i) => `group-${i}`)]);

const groupRules = (scheme: 'light' | 'dark') =>
  GROUP_PALETTE.map(
    (g, i) =>
      `.wtp-g${i}{fill:${g[scheme].fill};stroke:${g[scheme].stroke};stroke-width:${g.width}px;stroke-dasharray:${g.dash}}`,
  ).join('');

const CSS = `
.wtp{display:block;inline-size:100%;block-size:auto;direction:ltr}
.wtp text{fill:var(--wt-fg,#1f2937);font:11px/1 system-ui,sans-serif;dominant-baseline:central}
.wtp text.wtp-tick{fill:var(--wt-mut,#6b7280)}
.wtp-axis{stroke:var(--wt-mut,#6b7280);stroke-width:1.5;fill:none}
.wtp-grid{stroke:var(--wt-mut,#6b7280);stroke-width:.5;opacity:.35}
:where(.wtp-curve){stroke:var(--wt-fg,#1f2937);stroke-width:2.5;fill:none;stroke-linejoin:round}
:where(.wtp-vline){stroke:var(--wt-acc,#2563eb);stroke-width:1.5;stroke-dasharray:5 3;fill:none}
:where(.wtp-mark){fill:var(--wt-fg,#1f2937);stroke:var(--wt-bg,#fff);stroke-width:1.5}
/* a highlighted curve or line must not fill the area under it (the shell's wt-hl-* kinds set a fill) */
.wtp polyline,.wtp line{fill:none}
.wtp-g0,.wtp-g1,.wtp-g2,.wtp-g3,.wtp-g4,.wtp-g5{fill-opacity:.35}
${groupRules('light')}
@media (prefers-color-scheme:dark){${groupRules('dark')}}
`.trim();

// --- giá trị ---

const r2 = (x: number) => Math.round(x * 100) / 100;
const f = (x: number) => String(r2(x));

function num(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : NaN;
}

/** Nhãn số: tối đa 4 chữ số có nghĩa, bỏ số 0 thừa, `-0` thành `0`; không dùng locale. */
export function formatTick(v: number): string {
  if (!Number.isFinite(v)) return '';
  const n = Number(v.toPrecision(4));
  return String(Object.is(n, -0) ? 0 : n);
}

/**
 * Các vạch chia "đẹp" trong `[min, max]`: bước 1, 2 hoặc 5 × 10^k, khoảng `target` vạch. Rỗng khi khoảng không
 * dương hoặc không hữu hạn. Giá trị làm tròn theo bước nên không có sai số kiểu 0.30000000000000004.
 */
export function niceTicks(min: number, max: number, target = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min) || !(target >= 1)) return [];
  const raw = (max - min) / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const frac = raw / pow;
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * pow;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const out: number[] = [];
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + step * 1e-9; k++) {
    out.push(Number((k * step).toFixed(decimals)));
    if (out.length > 200) break;
  }
  return out;
}

export type XY = readonly [number, number];

/** Đoạn thẳng a→b cắt theo khung (Liang–Barsky); `null` khi nằm ngoài. */
function clipSegment(a: XY, b: XY, bd: Bounds): [XY, XY] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, a[0] - bd.xmin],
    [dx, bd.xmax - a[0]],
    [-dy, a[1] - bd.ymin],
    [dy, bd.ymax - a[1]],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

/**
 * Các điểm mẫu của một đường → các đường gấp khúc nằm trong khung `bounds`. Đoạn đi ra ngoài bị cắt đúng ở mép;
 * điểm không hữu hạn (hoặc không phải cặp số) ngắt đường; đường gấp khúc ít hơn 2 điểm bị bỏ.
 */
export function clipCurve(points: unknown, bounds: Bounds): XY[][] {
  const pts: (XY | null)[] = (Array.isArray(points) ? points : [])
    .slice(0, MAX_CURVE_POINTS)
    .map((p) => {
      const x = Array.isArray(p) ? num(p[0]) : NaN;
      const y = Array.isArray(p) ? num(p[1]) : NaN;
      return Number.isNaN(x) || Number.isNaN(y) ? null : ([x, y] as const);
    });
  const out: XY[][] = [];
  let cur: XY[] = [];
  const flush = () => {
    if (cur.length >= 2) out.push(cur);
    cur = [];
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) {
      flush();
      continue;
    }
    const seg = clipSegment(a, b, bounds);
    if (!seg) {
      flush();
      continue;
    }
    const [s, e] = seg;
    const last = cur[cur.length - 1];
    if (!last || last[0] !== s[0] || last[1] !== s[1]) {
      flush(); // đoạn trước ra khỏi khung rồi quay lại: bắt đầu đường mới
      cur.push(s);
    }
    cur.push(e);
  }
  flush();
  return out;
}

export interface PlotBox {
  left: number;
  top: number;
  w: number;
  h: number;
}

/** Hộp vẽ trong viewBox; hai trục có tỉ lệ độc lập. */
export const PLOT: PlotBox = {
  left: PAD.left,
  top: PAD.top,
  w: VIEW_W - PAD.left - PAD.right,
  h: VIEW_H - PAD.top - PAD.bottom,
};

export function toPlot(bounds: Bounds, box: PlotBox = PLOT) {
  return {
    sx: (x: number) => box.left + ((x - bounds.xmin) / (bounds.xmax - bounds.xmin)) * box.w,
    sy: (y: number) => box.top + box.h - ((y - bounds.ymin) / (bounds.ymax - bounds.ymin)) * box.h,
  };
}

interface Mark {
  id: string;
  x: number;
  y: number;
  label: string;
}

function list(x: unknown, max: number): Record<string, unknown>[] {
  return Array.isArray(x) ? x.filter(isRecord).slice(0, max) : [];
}

function idOf(x: unknown): string | null {
  return typeof x === 'string' && x !== '' ? x : null;
}

/** Điểm đánh dấu hợp lệ (id không rỗng, x/y hữu hạn, nhãn là chuỗi), tối đa `MAX_MARKS`. */
export function readMarks(raw: unknown): Mark[] {
  const out: Mark[] = [];
  for (const m of list(raw, MAX_MARKS * 2)) {
    const id = idOf(m.id);
    const x = num(m.x);
    const y = num(m.y);
    if (!id || Number.isNaN(x) || Number.isNaN(y)) continue;
    out.push({ id, x, y, label: clip(typeof m.label === 'string' ? m.label : '', MAX_LABEL) });
    if (out.length >= MAX_MARKS) break;
  }
  return out;
}

/** Mô tả cho trình đọc màn hình: đường (số điểm), điểm đánh dấu và đường thẳng đứng, kèm loại tô sáng. */
export function describePlot(
  curves: readonly { id: string; n: number }[],
  marks: readonly Mark[],
  vlines: readonly { id: string; x: number }[],
  highlights: Readonly<Record<string, unknown>>,
): string {
  const tag = (id: string) => {
    const k = highlights[id];
    return typeof k === 'string' && KINDS.has(k) ? `${id} (${k})` : id;
  };
  const parts: string[] = [];
  if (curves.length)
    parts.push(`curves: ${curves.map((c) => `${tag(c.id)} (${c.n} points)`).join(', ')}`);
  if (marks.length) {
    parts.push(
      `marks: ${marks.map((m) => `${tag(m.id)} (${formatTick(m.x)}, ${formatTick(m.y)})`).join(', ')}`,
    );
  }
  if (vlines.length)
    parts.push(
      `vertical lines: ${vlines.map((v) => `${tag(v.id)} (x = ${formatTick(v.x)})`).join(', ')}`,
    );
  return parts.join('; ');
}

// --- vẽ ---

interface View {
  host: HTMLElement;
  svg: SVGSVGElement;
  layer: SVGGElement;
}

let view: View | null = null;

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
  return kind.startsWith('group-') ? `${base} wtp-g${kind.slice(6)}` : `${base} wt-hl-${kind}`;
}

export const functionPlotterVisualizer: VisualizerRenderer = {
  type: 'functionPlotter',

  mount(el) {
    const doc = el.ownerDocument;
    const style = doc.createElement('style');
    style.textContent = CSS;
    const svg = svgEl(doc, 'svg', {
      class: 'wtp',
      viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
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
    const { sx, sy } = toPlot(bounds);

    const grid = svgEl(doc, 'g');
    const curvesG = svgEl(doc, 'g');
    const top = svgEl(doc, 'g');
    const text = (g: SVGGElement, s: string, attrs: Record<string, string>, cls?: string) => {
      const t = svgEl(doc, 'text', cls ? { class: cls, ...attrs } : attrs);
      t.textContent = s;
      g.appendChild(t);
    };

    // vạch chia và nhãn trục; trục đi qua 0 nếu 0 nằm trong khung, ngược lại sát mép dưới/trái
    for (const x of niceTicks(bounds.xmin, bounds.xmax)) {
      grid.appendChild(
        svgEl(doc, 'line', {
          class: 'wtp-grid',
          x1: f(sx(x)),
          y1: f(PLOT.top),
          x2: f(sx(x)),
          y2: f(PLOT.top + PLOT.h),
        }),
      );
      text(
        grid,
        formatTick(x),
        { x: f(sx(x)), y: f(PLOT.top + PLOT.h + 13), 'text-anchor': 'middle' },
        'wtp-tick',
      );
    }
    for (const y of niceTicks(bounds.ymin, bounds.ymax)) {
      grid.appendChild(
        svgEl(doc, 'line', {
          class: 'wtp-grid',
          x1: f(PLOT.left),
          y1: f(sy(y)),
          x2: f(PLOT.left + PLOT.w),
          y2: f(sy(y)),
        }),
      );
      text(
        grid,
        formatTick(y),
        { x: f(PLOT.left - 6), y: f(sy(y)), 'text-anchor': 'end' },
        'wtp-tick',
      );
    }
    const axisX = bounds.ymin <= 0 && bounds.ymax >= 0 ? sy(0) : PLOT.top + PLOT.h;
    const axisY = bounds.xmin <= 0 && bounds.xmax >= 0 ? sx(0) : PLOT.left;
    grid.appendChild(
      svgEl(doc, 'line', {
        class: 'wtp-axis',
        x1: f(PLOT.left),
        y1: f(axisX),
        x2: f(PLOT.left + PLOT.w),
        y2: f(axisX),
      }),
    );
    grid.appendChild(
      svgEl(doc, 'line', {
        class: 'wtp-axis',
        x1: f(axisY),
        y1: f(PLOT.top),
        x2: f(axisY),
        y2: f(PLOT.top + PLOT.h),
      }),
    );

    const curves = list(state.curves, MAX_CURVES).filter((c) => idOf(c.id));
    curves.forEach((c, i) => {
      for (const piece of clipCurve(c.points, bounds)) {
        const path = svgEl(doc, 'polyline', {
          class: kindClass('wtp-curve', hl[String(c.id)]),
          points: piece.map(([x, y]) => `${f(sx(x))},${f(sy(y))}`).join(' '),
        });
        if (CURVE_DASH[i] !== 'none') path.style.strokeDasharray = CURVE_DASH[i];
        curvesG.appendChild(path);
      }
    });

    const vlines = list(state.vlines, MAX_VLINES)
      .map((l) => ({
        id: idOf(l.id),
        x: num(l.x),
        label: typeof l.label === 'string' ? l.label : '',
      }))
      .filter(
        (l): l is { id: string; x: number; label: string } =>
          l.id !== null && l.x >= bounds.xmin && l.x <= bounds.xmax,
      );
    for (const l of vlines) {
      top.appendChild(
        svgEl(doc, 'line', {
          class: kindClass('wtp-vline', hl[l.id]),
          x1: f(sx(l.x)),
          y1: f(PLOT.top),
          x2: f(sx(l.x)),
          y2: f(PLOT.top + PLOT.h),
        }),
      );
      if (l.label) text(top, clip(l.label, MAX_LABEL), { x: f(sx(l.x) + 4), y: f(PLOT.top + 8) });
    }
    const marks = readMarks(state.marks).filter(
      (m) => m.x >= bounds.xmin && m.x <= bounds.xmax && m.y >= bounds.ymin && m.y <= bounds.ymax,
    );
    for (const m of marks) {
      top.appendChild(
        svgEl(doc, 'circle', {
          class: kindClass('wtp-mark', hl[m.id]),
          cx: f(sx(m.x)),
          cy: f(sy(m.y)),
          r: '4.5',
        }),
      );
      if (m.label) text(top, m.label, { x: f(sx(m.x) + 8), y: f(sy(m.y) - 8) });
    }

    v.svg.setAttribute(
      'aria-label',
      describePlot(
        curves.map((c) => ({
          id: String(c.id),
          n: Array.isArray(c.points) ? Math.min(c.points.length, MAX_CURVE_POINTS) : 0,
        })),
        marks,
        vlines,
        hl,
      ),
    );
    v.layer.replaceChildren(grid, curvesG, top);
  },

  destroy() {
    view?.host.replaceChildren();
    view = null;
  },
};
