/**
 * Visualizer `grid` (ARCHITECTURE §8; task 2-V4): bảng DP, bàn cờ, sàng. Chạy trong iframe null-origin:
 * không Node API. SVG dựng bằng `createElementNS`; dữ liệu vào DOM chỉ qua `textContent`/`setAttribute`.
 * State: `{ rows, cols, cells, rowLabels?, colLabels?, arrows? }`. Khoá `highlights` là `"r,c"` (0-based);
 * `arrows` là mũi tên phụ thuộc `{ from: "r,c", to: "r,c" }`.
 * Kind: `active|compare|result|visited|muted` (lớp `wt-hl-*` của shell) và `group-0..5` (lớp `wtg-g0..5` ở
 * CSS dưới đây; mỗi nhóm có màu, nét đứt và độ dày riêng nên không phân biệt chỉ bằng màu).
 * Class riêng có tiền tố `wtg-`; màu cơ bản lấy từ biến CSS của shell (`--wt-*`).
 * Giới hạn: tối đa 16 hàng × 13 cột (phần thừa bị bỏ), nhãn hàng/cột cắt ở 8 ký tự.
 */
import type { VisualizerRenderer } from '@/lib/tutor/protocol/widget-data';
import { isRecord } from '@/lib/tutor/runtime/layout';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MAX_ROWS = 16;
export const MAX_COLS = 13;
export const MAX_LABEL = 8;
const VIEW_W = 480;
const VIEW_H_MAX = 400;
const GAP = 2; // khe giữa hai ô
const MAX_CELL = 44;
const PAD = 10;
const LABEL_W = 62; // gutter cho nhãn hàng (8 ký tự × ~6,5 px)
const LABEL_H = 22; // gutter cho nhãn cột
const SHELL_KINDS = ['active', 'compare', 'result', 'visited', 'muted'];
const GROUPS = 6;
const KINDS = new Set([...SHELL_KINDS, ...Array.from({ length: GROUPS }, (_, i) => `group-${i}`)]);

/**
 * Bảng màu nhóm: `fill` nền ô (chữ dùng `--wt-fg`), `stroke` viền (>= 3:1 với `--wt-bg`, có test).
 * Mỗi nhóm một mẫu nét (`dash`, `width`) khác nhau và khác với 5 kind của shell.
 */
export const GROUP_PALETTE: readonly {
  light: { fill: string; stroke: string };
  dark: { fill: string; stroke: string };
  width: number;
  dash: string;
}[] = [
  {
    light: { fill: '#ccfbf1', stroke: '#0f766e' },
    dark: { fill: '#134e4a', stroke: '#2dd4bf' },
    width: 2,
    dash: 'none',
  },
  {
    light: { fill: '#f3e8ff', stroke: '#7e22ce' },
    dark: { fill: '#581c87', stroke: '#c084fc' },
    width: 3,
    dash: '10 3',
  },
  {
    light: { fill: '#fce7f3', stroke: '#be185d' },
    dark: { fill: '#831843', stroke: '#f472b6' },
    width: 3,
    dash: '1 3',
  },
  {
    light: { fill: '#ffedd5', stroke: '#c2410c' },
    dark: { fill: '#7c2d12', stroke: '#fb923c' },
    width: 3,
    dash: '6 2 2 2',
  },
  {
    light: { fill: '#e0e7ff', stroke: '#4338ca' },
    dark: { fill: '#312e81', stroke: '#a5b4fc' },
    width: 4,
    dash: '12 2 2 2 2 2',
  },
  {
    light: { fill: '#ecfccb', stroke: '#4d7c0f' },
    dark: { fill: '#365314', stroke: '#a3e635' },
    width: 2,
    dash: '3 3',
  },
];

const groupRules = (scheme: 'light' | 'dark') =>
  GROUP_PALETTE.map(
    (g, i) =>
      `.wtg-g${i}{fill:${g[scheme].fill};stroke:${g[scheme].stroke};stroke-width:${g.width}px;stroke-dasharray:${g.dash}}`,
  ).join('');

const CSS = `
.wtg{display:block;inline-size:100%;block-size:auto;direction:ltr}
.wtg text{fill:var(--wt-fg,#1f2937);font:11px/1 system-ui,sans-serif;text-anchor:middle;dominant-baseline:central}
.wtg text.wtg-lab{fill:var(--wt-mut,#6b7280)}
.wtg text.wtg-rowlab{text-anchor:end}
:where(.wtg-cell){fill:var(--wt-bg,#fff);stroke:var(--wt-mut,#6b7280);stroke-width:1}
.wtg-arrow{stroke:var(--wt-acc,#2563eb);stroke-width:1.5;fill:none;marker-end:url(#wtg-head)}
#wtg-head path{fill:var(--wt-acc,#2563eb)}
.wtg-cell,.wtg-arrow{transition:fill .3s,opacity .3s,stroke .3s,stroke-width .3s}
${groupRules('light')}
@media (prefers-color-scheme:dark){${groupRules('dark')}}
`.trim();

// --- giá trị ---

/** Số hữu hạn từ số hoặc chuỗi số; ngược lại `NaN`. */
function toNumber(x: unknown): number {
  if (typeof x === 'number') return x;
  return typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
}

/** Cắt theo ký tự (không cắt đôi cặp thay thế); quá `max` thì thêm `…`. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, Math.max(max - 1, 0)).join('')}…`;
}

/** Chữ hiển thị trong ô: `null`/lạ → rỗng, ±Infinity → `∞` (DP hay dùng INF). */
export function cellText(v: unknown): string {
  if (typeof v === 'number') {
    if (v === Infinity) return '∞';
    if (v === -Infinity) return '-∞';
    return String(v);
  }
  return typeof v === 'string' ? v : '';
}

function parseKey(key: unknown, rows: number, cols: number): { r: number; c: number } | null {
  if (typeof key !== 'string') return null;
  const m = /^(\d+),(\d+)$/.exec(key);
  if (!m) return null;
  const r = Number(m[1]);
  const c = Number(m[2]);
  return r < rows && c < cols ? { r, c } : null;
}

/** Số hàng/cột dùng để vẽ: `rows`/`cols` của state nếu là số nguyên, ngược lại theo `cells`; kẹp [0, tối đa]. */
export function gridSize(state: Record<string, unknown>): { rows: number; cols: number } {
  const cells = Array.isArray(state.cells) ? state.cells : [];
  const inferredCols = Math.max(0, ...cells.map((row) => (Array.isArray(row) ? row.length : 0)));
  const dim = (declared: unknown, inferred: number, max: number) => {
    const n = toNumber(declared);
    return Math.min(Number.isInteger(n) && n >= 0 ? n : inferred, max);
  };
  return {
    rows: dim(state.rows, cells.length, MAX_ROWS),
    cols: dim(state.cols, inferredCols, MAX_COLS),
  };
}

// --- bố cục thuần ---

export interface CellBox {
  r: number;
  c: number;
  x: number;
  y: number;
  /** Cạnh ô (đã trừ khe). */
  size: number;
  /** Tâm ô. */
  cx: number;
  cy: number;
}

export interface GridLayout {
  /** Bước giữa hai ô liền kề (ô + khe). */
  cell: number;
  gridW: number;
  gridH: number;
  cells: CellBox[];
}

/**
 * Ô vuông, cùng cỡ, xếp từ góc trên trái của vùng `[0,width]×[0,height]`; cỡ lớn nhất vừa cả hai chiều,
 * tối đa `MAX_CELL`. Số hàng/cột kẹp ở `MAX_ROWS`/`MAX_COLS`; số âm hoặc không nguyên coi là 0.
 */
export function gridLayout(rows: number, cols: number, width: number, height: number): GridLayout {
  const norm = (n: number, max: number) => Math.min(Number.isInteger(n) && n > 0 ? n : 0, max);
  const R = norm(rows, MAX_ROWS);
  const C = norm(cols, MAX_COLS);
  if (R === 0 || C === 0) return { cell: 0, gridW: 0, gridH: 0, cells: [] };
  const cell = Math.max(Math.min(width / C, height / R, MAX_CELL), 0);
  const size = Math.max(cell - GAP, 0);
  const cells: CellBox[] = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const x = c * cell + GAP / 2;
      const y = r * cell + GAP / 2;
      cells.push({ r, c, x, y, size, cx: x + size / 2, cy: y + size / 2 });
    }
  }
  return { cell, gridW: C * cell, gridH: R * cell, cells };
}

export interface ArrowSeg {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Mũi tên giữa hai ô, rút ngắn ở hai đầu để không đè lên chữ (cuối rút nhiều hơn chỗ đầu mũi).
 * Bỏ: khoá sai dạng hoặc ngoài lưới, from = to, trùng cặp.
 */
export function layoutArrows(arrows: unknown, layout: GridLayout, rows: number, cols: number) {
  if (!Array.isArray(arrows)) return [];
  const R = Math.min(rows, MAX_ROWS);
  const C = Math.min(cols, MAX_COLS);
  const segs: ArrowSeg[] = [];
  const seen = new Set<string>();
  for (const a of arrows) {
    if (!isRecord(a)) continue;
    const from = parseKey(a.from, R, C);
    const to = parseKey(a.to, R, C);
    if (!from || !to || (from.r === to.r && from.c === to.c)) continue;
    const id = `${a.from as string}>${a.to as string}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const p = layout.cells[from.r * C + from.c];
    const q = layout.cells[to.r * C + to.c];
    if (!p || !q) continue;
    const dx = q.cx - p.cx;
    const dy = q.cy - p.cy;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const cut0 = Math.min(layout.cell * 0.3, len / 3);
    const cut1 = Math.min(layout.cell * 0.4, len / 3);
    segs.push({
      from: a.from as string,
      to: a.to as string,
      x1: p.cx + ux * cut0,
      y1: p.cy + uy * cut0,
      x2: q.cx - ux * cut1,
      y2: q.cy - uy * cut1,
    });
  }
  return segs;
}

/**
 * Mô tả cho trình đọc màn hình: mỗi hàng `nhãn: v, v (active), …`, các hàng cách nhau `; `; ô rỗng là `-`,
 * ô tô sáng kèm loại; mũi tên (nếu có) ở cuối: `arrows: 0,0→1,1`.
 */
export function describeGrid(
  cells: readonly unknown[],
  rows: number,
  cols: number,
  highlights: Readonly<Record<string, unknown>>,
  rowLabels: readonly unknown[] = [],
  arrows: readonly ArrowSeg[] = [],
): string {
  const lines: string[] = [];
  for (let r = 0; r < Math.min(rows, MAX_ROWS); r++) {
    const row: unknown[] = Array.isArray(cells[r]) ? (cells[r] as unknown[]) : [];
    const parts: string[] = [];
    for (let c = 0; c < Math.min(cols, MAX_COLS); c++) {
      const text = cellText(row[c]) || '-';
      const kind = highlights[`${r},${c}`];
      parts.push(typeof kind === 'string' && KINDS.has(kind) ? `${text} (${kind})` : text);
    }
    const label = clip(String(rowLabels[r] ?? ''), MAX_LABEL) || String(r);
    lines.push(`${label}: ${parts.join(', ')}`);
  }
  if (arrows.length > 0) lines.push(`arrows: ${arrows.map((a) => `${a.from}→${a.to}`).join(', ')}`);
  return lines.join('; ');
}

// --- vẽ ---

interface View {
  host: HTMLElement;
  svg: SVGSVGElement;
  origin: SVGGElement;
  cellLayer: SVGGElement;
  arrowLayer: SVGGElement;
  labelLayer: SVGGElement;
  cells: Map<string, { rect: SVGRectElement; text: SVGTextElement }>;
  arrows: Map<string, SVGLineElement>;
  labels: SVGTextElement[];
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

function kindClass(kind: unknown): string {
  if (typeof kind !== 'string' || !KINDS.has(kind)) return 'wtg-cell';
  return kind.startsWith('group-') ? `wtg-cell wtg-g${kind.slice(6)}` : `wtg-cell wt-hl-${kind}`;
}

function labelsOf(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

export const gridVisualizer: VisualizerRenderer = {
  type: 'grid',

  mount(el) {
    const doc = el.ownerDocument;
    const style = doc.createElement('style');
    style.textContent = CSS;
    const svg = svgEl(doc, 'svg', {
      class: 'wtg',
      viewBox: `0 0 ${VIEW_W} 60`,
      role: 'img',
    });
    const defs = svgEl(doc, 'defs');
    const head = svgEl(doc, 'marker', {
      id: 'wtg-head',
      viewBox: '0 0 10 10',
      refX: '9',
      refY: '5',
      markerWidth: '6',
      markerHeight: '6',
      orient: 'auto',
    });
    head.appendChild(svgEl(doc, 'path', { d: 'M0,0 L10,5 L0,10 z' }));
    defs.appendChild(head);
    const origin = svgEl(doc, 'g');
    const labelLayer = svgEl(doc, 'g');
    const cellLayer = svgEl(doc, 'g');
    const arrowLayer = svgEl(doc, 'g');
    origin.append(labelLayer, cellLayer, arrowLayer);
    svg.append(defs, origin);
    el.replaceChildren(style, svg);
    view = {
      host: el,
      svg,
      origin,
      cellLayer,
      arrowLayer,
      labelLayer,
      cells: new Map(),
      arrows: new Map(),
      labels: [],
    };
  },

  render(frame) {
    const v = view;
    if (!v) return;
    const doc = v.host.ownerDocument;
    const state = isRecord(frame.state) ? frame.state : {};
    const { rows, cols } = gridSize(state);
    const cells: unknown[] = Array.isArray(state.cells) ? state.cells : [];
    const rowLabels = labelsOf(state.rowLabels);
    const colLabels = labelsOf(state.colLabels);
    const highlights = isRecord(frame.meta?.highlights) ? frame.meta.highlights : {};

    const left = rowLabels.length > 0 ? LABEL_W : PAD;
    const top = colLabels.length > 0 ? LABEL_H : PAD;
    const layout = gridLayout(rows, cols, VIEW_W - left - PAD, VIEW_H_MAX - top - PAD);
    const segs = layoutArrows(state.arrows, layout, rows, cols);

    v.svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${f(top + layout.gridH + PAD)}`);
    v.svg.setAttribute('aria-label', describeGrid(cells, rows, cols, highlights, rowLabels, segs));
    v.origin.setAttribute('transform', `translate(${f(left)} ${f(top)})`);

    // ô: theo khoá "r,c"; thiếu thì tạo, thừa thì bỏ
    const want = new Set<string>();
    for (const box of layout.cells) {
      const key = `${box.r},${box.c}`;
      want.add(key);
      let cell = v.cells.get(key);
      if (!cell) {
        const rect = svgEl(doc, 'rect', { rx: '3' });
        const text = svgEl(doc, 'text');
        v.cellLayer.append(rect, text);
        cell = { rect, text };
        v.cells.set(key, cell);
      }
      const row: unknown[] = Array.isArray(cells[box.r]) ? (cells[box.r] as unknown[]) : [];
      const fs = Math.min(Math.max(box.size * 0.4, 8), 14);
      cell.rect.setAttribute('x', f(box.x));
      cell.rect.setAttribute('y', f(box.y));
      cell.rect.setAttribute('width', f(box.size));
      cell.rect.setAttribute('height', f(box.size));
      cell.rect.setAttribute('class', kindClass(highlights[key]));
      cell.text.setAttribute('x', f(box.cx));
      cell.text.setAttribute('y', f(box.cy));
      cell.text.setAttribute('font-size', f(fs));
      cell.text.textContent = clip(
        cellText(row[box.c]),
        Math.max(2, Math.floor(box.size / (fs * 0.6))),
      );
    }
    for (const [key, cell] of v.cells) {
      if (want.has(key)) continue;
      cell.rect.remove();
      cell.text.remove();
      v.cells.delete(key);
    }

    // nhãn hàng/cột: dựng lại (ít, rẻ)
    for (const t of v.labels) t.remove();
    v.labels = [];
    const label = (text: string, attrs: Record<string, string>, cls: string) => {
      const t = svgEl(doc, 'text', { class: cls, ...attrs });
      t.textContent = text;
      v.labelLayer.appendChild(t);
      v.labels.push(t);
    };
    const colMax = Math.min(MAX_LABEL, Math.max(1, Math.floor(layout.cell / 6.5)));
    for (const box of layout.cells) {
      if (box.c === 0 && rowLabels[box.r] !== undefined) {
        label(
          clip(String(rowLabels[box.r]), MAX_LABEL),
          { x: '-6', y: f(box.cy) },
          'wtg-lab wtg-rowlab',
        );
      }
      if (box.r === 0 && colLabels[box.c] !== undefined) {
        label(clip(String(colLabels[box.c]), colMax), { x: f(box.cx), y: '-10' }, 'wtg-lab');
      }
    }

    // mũi tên phụ thuộc
    const seen = new Set<string>();
    for (const s of segs) {
      const id = `${s.from}>${s.to}`;
      seen.add(id);
      let line = v.arrows.get(id);
      if (!line) {
        line = svgEl(doc, 'line', { class: 'wtg-arrow' });
        v.arrowLayer.appendChild(line);
        v.arrows.set(id, line);
      }
      line.setAttribute('x1', f(s.x1));
      line.setAttribute('y1', f(s.y1));
      line.setAttribute('x2', f(s.x2));
      line.setAttribute('y2', f(s.y2));
    }
    for (const [id, line] of v.arrows) {
      if (seen.has(id)) continue;
      line.remove();
      v.arrows.delete(id);
    }
  },

  destroy() {
    view?.host.replaceChildren();
    view = null;
  },
};
