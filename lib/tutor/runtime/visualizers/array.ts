/**
 * Visualizer `array` (ARCHITECTURE §8): chế độ `bars` (cột), `cells` (ô) và `bits` (ô bit), cộng
 * hàng phụ `rows` và khoảng `intervals`. Chạy trong iframe null-origin: không Node API.
 * SVG dựng bằng `createElementNS`; dữ liệu vào DOM chỉ qua `textContent`/`setAttribute`.
 * State: `{ values, mode, rows?, intervals?, threshold? }`
 * - `rows`: `{ label, values: (number|string|null)[], offset? }[]`; hàng phụ k, ô thứ i nằm ở cột
 *   `offset + i` của lưới chung với hàng chính (cột 0 = `values[0]`); `null` là ô trống.
 * - `intervals`: `{ id, start, end, label? }[]`, đoạn nửa mở `[start, end)` trên cùng trục cột.
 * - `threshold`: vạch ngang (chỉ chế độ `bars`).
 * Khoá `highlights`: `"3"` (chỉ số hàng chính), `"r<k>:<i>"` (ô i của hàng phụ k), id khoảng.
 * Kind: `active|compare|result|visited|muted` (CSS của shell) và `group-0…group-5` (CSS ở đây:
 * màu cố định + mẫu nét riêng cho từng nhóm để không phân biệt chỉ bằng màu).
 * `pointers` (`lo`/`hi`/`mid`…) là mũi tên có nhãn dưới chỉ số của hàng chính.
 * Class riêng có tiền tố `wta-`; màu lấy từ biến CSS của shell (`--wt-*`); chuyển động bằng CSS transition.
 */
import type { VisualizerRenderer } from '@/lib/tutor/protocol/widget-data';
import { isRecord } from '@/lib/tutor/runtime/layout';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 480;
const VIEW_H = 232; // chiều cao vùng chính của chế độ `bars`
const PAD_X = 16;
const PLOT_TOP = 28; // chừa chỗ cho nhãn giá trị của cột cao nhất và nhãn vạch ngưỡng
const PLOT_H = 130;
const INDEX_Y = 184;
const POINTER_Y = 194;
const LANE_W = 20; // các con trỏ cùng một chỉ số dàn ngang trong ô
const MAX_BAR_W = 56;
const MIN_BAR_H = 2; // cột khác 0 luôn nhìn thấy được (giá trị nhỏ trên thang lớn)
// chế độ cells/bits
const CELL_Y = 14;
const CELL_H = 30;
const MAX_CELL_W = 56;
const MAX_BIT_W = 30;
const CHAR_W = 7; // [Unverified] bề rộng ước lượng một ký tự 11–14px, chỉ để cắt chữ dài
// hàng phụ và khoảng
const LABEL_W = 72; // lề trái chứa nhãn hàng phụ
const ROW_PITCH = 34;
const ROW_H = 28;
const LANE_PITCH = 24;
const LANE_H = 18;
const BLOCK_GAP = 6;
const BOTTOM_PAD = 8;
// [Unverified] trần chống state hỏng làm lưới phình; catalog hiện chưa dùng tới
const MAX_ROWS = 8;
const MAX_INTERVALS = 24;
const MAX_COL = 4096;
const BASE_KINDS = ['active', 'compare', 'result', 'visited', 'muted'] as const;
export const GROUP_KINDS = [0, 1, 2, 3, 4, 5].map((k) => `group-${k}`);
const KINDS = new Set<string>([...BASE_KINDS, ...GROUP_KINDS]);

/**
 * Bảng nhóm cố định: nét `light`/`dark` (>= 3:1 so với `--wt-bg` của shell, có test), mẫu tô và nét
 * đứt khác nhau từng nhóm. Mẫu: sọc chéo /, chấm, ngang, lưới, sọc chéo \, dọc.
 */
export const GROUP_STYLES = [
  { light: '#0072b2', dark: '#56b4e9', dash: 'none', width: 2 },
  { light: '#c2410c', dark: '#fb923c', dash: '6 3', width: 2 },
  { light: '#0f766e', dark: '#34d399', dash: '2 2', width: 2 },
  { light: '#9b3f7a', dark: '#f0a3cf', dash: '8 2 2 2', width: 2 },
  { light: '#8c6d00', dark: '#e6c84a', dash: '1 3', width: 2 },
  { light: '#6d28d9', dark: '#a78bfa', dash: 'none', width: 4 },
] as const;
const GROUP_PATTERNS = [
  'M0 6L6 0',
  'M3 3m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  'M0 3H6',
  'M0 3H6M3 0V6',
  'M0 0L6 6',
  'M3 0V6',
];

const vars = (k: 'light' | 'dark') => GROUP_STYLES.map((g, i) => `--wta-g${i}:${g[k]}`).join(';');
const groupRules = GROUP_STYLES.map(
  (g, i) =>
    `.wta .wt-hl-group-${i}{fill:url(#wta-pat-${i});stroke:var(--wta-g${i});stroke-width:${g.width}px;stroke-dasharray:${g.dash};opacity:1}`,
).join('\n');

const CSS = `
.wta{display:block;inline-size:100%;block-size:auto;direction:ltr;${vars('light')}}
@media (prefers-color-scheme:dark){.wta{${vars('dark')}}}
.wta text{fill:var(--wt-fg,#1f2937);font:11px/1 system-ui,sans-serif;text-anchor:middle}
.wta text.wta-idx{fill:var(--wt-mut,#6b7280)}
.wta text.wta-val{font-size:13px}
.wta text.wta-bitv{font:600 14px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.wta text.wta-rowl{fill:var(--wt-mut,#6b7280);text-anchor:end}
.wta text.wta-ivl{font-size:10px}
:where(.wta-bar,.wta-cell,.wta-iv){fill:var(--wt-bg,#fff);stroke:var(--wt-mut,#6b7280);stroke-width:1}
:where(.wta-empty){stroke-dasharray:3 3}
:where(.wta-bit1){fill:var(--wt-vis,#e5e7eb)}
.wta-axis{stroke:var(--wt-mut,#6b7280);stroke-width:1}
.wta-thr line{stroke:var(--wt-err,#dc2626);stroke-width:1.5;stroke-dasharray:6 4}
.wta-thr text{fill:var(--wt-err,#dc2626);text-anchor:end}
.wta-ptr polygon{fill:var(--wt-acc,#2563eb)}
.wta-ptr text{fill:var(--wt-acc,#2563eb);font-weight:600}
.wta-bar.wt-hl-muted{opacity:1}
${groupRules}
.wta g,.wta rect{transition:transform .3s ease,y .3s ease,height .3s ease,fill .3s,opacity .3s,stroke .3s,stroke-width .3s}
`.trim();

/** Số hữu hạn từ số hoặc chuỗi số; ngược lại `NaN`. */
function toNumber(x: unknown): number {
  if (typeof x === 'number') return x;
  return typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
}

function finiteOr0(x: unknown): number {
  const n = toNumber(x);
  return Number.isFinite(n) ? n : 0;
}

// --- bố cục thuần (toạ độ trong vùng vẽ [0,width] × [0,height]) ---

export interface BarBox {
  index: number;
  value: number;
  /** Tâm ngang của ô. */
  cx: number;
  x: number;
  width: number;
  /** Cạnh trên của cột (số dương nằm trên đường gốc, số âm treo dưới). */
  y: number;
  height: number;
}

export interface BarsLayout {
  /** Toạ độ y của đường gốc (giá trị 0). */
  baseline: number;
  /** Số điểm ảnh trên một đơn vị giá trị; cùng thang cho mọi cột. */
  scale: number;
  bars: BarBox[];
}

/**
 * Cột tỉ lệ với |v| trên cùng một thang: cột dương cao nhất chạm đỉnh, cột âm sâu nhất chạm đáy.
 * `extra` là các giá trị phải nằm trong thang nhưng không phải cột (vạch ngưỡng).
 * Giá trị không phải số hữu hạn coi là 0.
 */
export function layoutBars(
  values: readonly unknown[],
  width: number,
  height: number,
  extra: readonly number[] = [],
): BarsLayout {
  const vs = values.map(finiteOr0);
  let top = 0;
  let bottom = 0;
  for (const v of [...vs, ...extra.map(finiteOr0)]) {
    if (v > top) top = v;
    if (v < bottom) bottom = v;
  }
  const span = top - bottom;
  const scale = span > 0 ? height / span : 0;
  const baseline = span > 0 ? top * scale : height;
  const slot = vs.length > 0 ? width / vs.length : 0;
  const barW = Math.min(slot * 0.7, MAX_BAR_W);
  const bars = vs.map((value, index): BarBox => {
    const cx = (index + 0.5) * slot;
    const h = value === 0 ? 0 : Math.max(Math.abs(value) * scale, MIN_BAR_H);
    return {
      index,
      value,
      cx,
      x: cx - barW / 2,
      width: barW,
      y: value < 0 ? baseline : baseline - h,
      height: h,
    };
  });
  return { baseline, scale, bars };
}

export interface PointerMark {
  name: string;
  /** Chỉ số ô sau khi kẹp vào [0, n−1]. */
  index: number;
  label: string;
  /** Vị trí trong nhóm con trỏ cùng ô và số con trỏ của nhóm đó. */
  lane: number;
  lanes: number;
}

/** Con trỏ không phải số nguyên bị bỏ; ngoài miền (vd. `hi = −1`) kẹp vào ô đầu/cuối, nhãn kèm giá trị. */
export function layoutPointers(pointers: unknown, n: number): PointerMark[] {
  if (!isRecord(pointers) || n <= 0) return [];
  const marks: PointerMark[] = [];
  const perCell = new Map<number, number>();
  for (const [name, raw] of Object.entries(pointers)) {
    const value = toNumber(raw);
    if (!Number.isInteger(value)) continue;
    const index = Math.min(Math.max(value, 0), n - 1);
    const lane = perCell.get(index) ?? 0;
    perCell.set(index, lane + 1);
    marks.push({ name, index, label: index === value ? name : `${name}=${value}`, lane, lanes: 0 });
  }
  for (const m of marks) m.lanes = perCell.get(m.index) ?? 1;
  return marks;
}

/**
 * Mô tả cho trình đọc màn hình: `5, 8 (compare), 13 (active, mid)`. Mỗi ô: giá trị, rồi trong ngoặc
 * loại tô sáng (nếu có) và nhãn các con trỏ đang trỏ vào ô đó; ô không có gì thì chỉ có giá trị.
 */
export function describeBars(
  values: readonly unknown[],
  highlights: Readonly<Record<string, unknown>>,
  marks: readonly PointerMark[],
): string {
  return values
    .map((v, i) => {
      const kind = highlights[String(i)];
      const notes = [
        ...(typeof kind === 'string' && KINDS.has(kind) ? [kind] : []),
        ...marks.filter((m) => m.index === i).map((m) => m.label),
      ];
      return notes.length > 0 ? `${String(v)} (${notes.join(', ')})` : String(v);
    })
    .join(', ');
}

// --- hàng phụ, khoảng, lưới cột ---

export type Cell = number | string | null;

export interface RowSpec {
  label: string;
  values: Cell[];
  offset: number;
}

export interface IntervalSpec {
  id: string;
  start: number;
  end: number;
  label: string;
}

const clampCol = (n: number) => Math.min(Math.max(n, -MAX_COL), MAX_COL);

/** Chuỗi cắt còn tối đa `max` ký tự (đếm theo code point), thêm `…` nếu bị cắt. */
export function clipText(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return max < 1 ? '' : `${chars.slice(0, max - 1).join('')}…`;
}

function parseCell(x: unknown): Cell {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  return typeof x === 'string' ? x : null;
}

/** Hàng phụ hợp lệ (tối đa 8); phần tử hỏng bị bỏ, `offset` lấy phần nguyên và kẹp. */
export function parseRows(x: unknown): RowSpec[] {
  if (!Array.isArray(x)) return [];
  const rows: RowSpec[] = [];
  for (const r of x) {
    if (!isRecord(r) || !Array.isArray(r.values) || rows.length >= MAX_ROWS) continue;
    const offset = Math.trunc(toNumber(r.offset));
    rows.push({
      label: String(r.label ?? ''),
      values: r.values.map(parseCell),
      offset: Number.isFinite(offset) ? clampCol(offset) : 0,
    });
  }
  return rows;
}

/** Khoảng hợp lệ (tối đa 24): số hữu hạn, `end >= start`, id không trùng (khoảng đầu thắng). */
export function parseIntervals(x: unknown): IntervalSpec[] {
  if (!Array.isArray(x)) return [];
  const out: IntervalSpec[] = [];
  const ids = new Set<string>();
  for (const r of x) {
    if (!isRecord(r) || out.length >= MAX_INTERVALS) continue;
    const id = String(r.id ?? '');
    const start = toNumber(r.start);
    const end = toNumber(r.end);
    if (id === '' || ids.has(id) || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end < start) continue;
    ids.add(id);
    out.push({ id, start: clampCol(start), end: clampCol(end), label: String(r.label ?? id) });
  }
  return out;
}

export interface Grid {
  /** Cột nhỏ nhất (<= 0): ô đầu của hàng chính nằm ở cột 0. */
  colStart: number;
  cols: number;
}

/** Lưới cột chung của hàng chính, các hàng phụ (theo `offset`) và các khoảng. */
export function layoutGrid(
  n: number,
  rows: readonly RowSpec[],
  intervals: readonly IntervalSpec[],
): Grid {
  let lo = 0;
  let hi = n;
  for (const r of rows) {
    lo = Math.min(lo, r.offset);
    hi = Math.max(hi, r.offset + r.values.length);
  }
  for (const iv of intervals) {
    lo = Math.min(lo, Math.floor(iv.start));
    hi = Math.max(hi, Math.ceil(iv.end));
  }
  return { colStart: lo, cols: hi - lo };
}

/** Làn của từng khoảng (giữ thứ tự vào): khoảng không chồng nhau dùng chung làn; `[a,b)` và `[b,c)` không chồng. */
export function layoutIntervalLanes(intervals: readonly IntervalSpec[]): number[] {
  const laneEnd: number[] = [];
  const order = intervals
    .map((_, i) => i)
    .sort((a, b) => intervals[a].start - intervals[b].start || a - b);
  const lanes: number[] = [];
  for (const i of order) {
    let lane = laneEnd.findIndex((end) => end <= intervals[i].start);
    if (lane < 0) lane = laneEnd.length;
    laneEnd[lane] = Math.max(intervals[i].end, intervals[i].start + Number.MIN_VALUE);
    lanes[i] = lane;
  }
  return lanes;
}

export function parseMode(x: unknown): 'bars' | 'cells' | 'bits' {
  return x === 'cells' || x === 'bits' ? x : 'bars';
}

/**
 * Mô tả đầy đủ cho trình đọc màn hình: hàng chính như `describeBars`, rồi mỗi hàng phụ
 * (`nhãn: ô, ô (kind)`; ô trống là `empty`) và mỗi khoảng (`nhãn [start, end) (kind)`), ngăn bằng `; `.
 */
export function describeArray(
  values: readonly unknown[],
  highlights: Readonly<Record<string, unknown>>,
  marks: readonly PointerMark[],
  rows: readonly RowSpec[] = [],
  intervals: readonly IntervalSpec[] = [],
): string {
  const kindOf = (key: string) => {
    const k = highlights[key];
    return typeof k === 'string' && KINDS.has(k) ? ` (${k})` : '';
  };
  return [
    describeBars(values, highlights, marks),
    ...rows.map(
      (r, k) =>
        `${r.label}: ${r.values.map((v, i) => `${v === null ? 'empty' : String(v)}${kindOf(`r${k}:${i}`)}`).join(', ')}`,
    ),
    ...intervals.map((iv) => `${iv.label} [${iv.start}, ${iv.end})${kindOf(iv.id)}`),
  ]
    .filter((part) => part !== '')
    .join('; ');
}

// --- vẽ ---

interface Bar {
  g: SVGGElement;
  rect: SVGRectElement;
  valueG: SVGGElement;
  value: SVGTextElement;
  index: SVGTextElement;
}

interface Pointer {
  g: SVGGElement;
  text: SVGTextElement;
}

/** Ô (hàng chính ở chế độ cells/bits, ô hàng phụ, khoảng): nhóm `g` đặt bằng `translate` + `rect` + `text`. */
interface CellEl {
  el: SVGElement;
  g: SVGGElement;
  rect: SVGRectElement;
  text: SVGTextElement;
}

interface TextEl {
  el: SVGElement;
  text: SVGTextElement;
}

/** Tập phần tử dựng lại theo khoá: giữ nguyên nút DOM giữa các frame để CSS transition chạy. */
interface Pool<T extends { el: SVGElement }> {
  layer: SVGGElement;
  items: Map<string, T>;
  seen: Set<string>;
  make(doc: Document): T;
}

interface View {
  host: HTMLElement;
  svg: SVGSVGElement;
  axis: SVGGElement;
  barLayer: SVGGElement;
  thr: SVGGElement;
  thrText: SVGTextElement;
  indexLayer: SVGGElement;
  pointerLayer: SVGGElement;
  bars: Bar[];
  pointers: Map<string, Pointer>;
  cells: Pool<CellEl>; // hàng chính (cells/bits)
  indexes: Pool<TextEl>; // chỉ số của hàng chính (cells/bits)
  rowCells: Pool<CellEl>;
  rowLabels: Pool<TextEl>;
  ivs: Pool<CellEl>;
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

function makeCell(doc: Document): CellEl {
  const g = svgEl(doc, 'g');
  const rect = svgEl(doc, 'rect');
  const text = svgEl(doc, 'text');
  g.append(rect, text);
  return { el: g, g, rect, text };
}

function makeText(doc: Document): TextEl {
  const text = svgEl(doc, 'text');
  return { el: text, text };
}

function makePool<T extends { el: SVGElement }>(
  layer: SVGGElement,
  make: (doc: Document) => T,
): Pool<T> {
  return { layer, items: new Map(), seen: new Set(), make };
}

function take<T extends { el: SVGElement }>(p: Pool<T>, key: string): T {
  let item = p.items.get(key);
  if (!item) {
    item = p.make(p.layer.ownerDocument);
    p.items.set(key, item);
    p.layer.appendChild(item.el);
  }
  p.seen.add(key);
  return item;
}

/** Bỏ phần tử không được `take` kể từ lần quét trước. */
function sweep<T extends { el: SVGElement }>(p: Pool<T>): void {
  for (const [key, item] of p.items) {
    if (p.seen.has(key)) continue;
    item.el.remove();
    p.items.delete(key);
  }
  p.seen.clear();
}

function createBar(v: View): Bar {
  const doc = v.host.ownerDocument;
  const g = svgEl(doc, 'g');
  const rect = svgEl(doc, 'rect', { class: 'wta-bar' });
  const valueG = svgEl(doc, 'g');
  const value = svgEl(doc, 'text');
  const index = svgEl(doc, 'text', { class: 'wta-idx', y: String(INDEX_Y) });
  valueG.appendChild(value);
  g.append(rect, valueG);
  v.barLayer.appendChild(g);
  v.indexLayer.appendChild(index);
  return { g, rect, valueG, value, index };
}

function createPointer(v: View, name: string): Pointer {
  const doc = v.host.ownerDocument;
  const g = svgEl(doc, 'g', { class: 'wta-ptr', 'data-pointer': name });
  const arrow = svgEl(doc, 'polygon', { points: '0,0 -5,8 5,8' });
  const text = svgEl(doc, 'text', { y: '20' });
  g.append(arrow, text);
  v.pointerLayer.appendChild(g);
  return { g, text };
}

function parseThreshold(x: unknown): { value: number; label: string } | null {
  if (!isRecord(x)) return null;
  const value = toNumber(x.value);
  return Number.isFinite(value) ? { value, label: String(x.label ?? '') } : null;
}

const hlClass = (base: string, kind: unknown): string =>
  typeof kind === 'string' && KINDS.has(kind) ? `${base} wt-hl-${kind}` : base;

function placeCell(
  c: CellEl,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  cls: string,
  textCls: string,
): void {
  c.g.setAttribute('transform', `translate(${f(x)} ${f(y)})`);
  c.rect.setAttribute('width', f(w));
  c.rect.setAttribute('height', f(h));
  c.rect.setAttribute('class', cls);
  c.text.setAttribute('x', f(w / 2));
  c.text.setAttribute('y', f(h / 2 + 4));
  c.text.setAttribute('class', textCls);
  c.text.textContent = text;
}

function placeText(t: TextEl, x: number, y: number, text: string, cls: string): void {
  t.text.setAttribute('x', f(x));
  t.text.setAttribute('y', f(y));
  t.text.setAttribute('class', cls);
  t.text.textContent = text;
}

export const arrayVisualizer: VisualizerRenderer = {
  type: 'array',

  mount(el) {
    const doc = el.ownerDocument;
    const style = doc.createElement('style');
    style.textContent = CSS;
    const svg = svgEl(doc, 'svg', {
      class: 'wta',
      viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
      role: 'img',
    });
    const defs = svgEl(doc, 'defs');
    GROUP_PATTERNS.forEach((d, i) => {
      const pat = svgEl(doc, 'pattern', {
        id: `wta-pat-${i}`,
        width: '6',
        height: '6',
        patternUnits: 'userSpaceOnUse',
      });
      const colour = `var(--wta-g${i})`;
      pat.append(
        svgEl(doc, 'rect', { width: '6', height: '6', fill: colour, 'fill-opacity': '0.16' }),
        svgEl(doc, 'path', {
          d: d,
          stroke: colour,
          fill: i === 1 ? colour : 'none',
          'stroke-width': '1',
        }),
      );
      defs.appendChild(pat);
    });
    const axis = svgEl(doc, 'g');
    axis.appendChild(svgEl(doc, 'line', { class: 'wta-axis' }));
    const barLayer = svgEl(doc, 'g');
    const thr = svgEl(doc, 'g', { class: 'wta-thr', display: 'none' });
    thr.appendChild(svgEl(doc, 'line', { y1: '0', y2: '0' }));
    const thrText = svgEl(doc, 'text', { x: String(VIEW_W - PAD_X), y: '-4' });
    thr.appendChild(thrText);
    const cellLayer = svgEl(doc, 'g');
    const indexLayer = svgEl(doc, 'g');
    const pointerLayer = svgEl(doc, 'g');
    const rowLayer = svgEl(doc, 'g');
    const labelLayer = svgEl(doc, 'g');
    const ivLayer = svgEl(doc, 'g');
    svg.append(
      defs,
      axis,
      barLayer,
      thr,
      cellLayer,
      indexLayer,
      pointerLayer,
      rowLayer,
      labelLayer,
      ivLayer,
    );
    el.replaceChildren(style, svg);
    view = {
      host: el,
      svg,
      axis,
      barLayer,
      thr,
      thrText,
      indexLayer,
      pointerLayer,
      bars: [],
      pointers: new Map(),
      cells: makePool(cellLayer, makeCell),
      indexes: makePool(indexLayer, makeText),
      rowCells: makePool(rowLayer, makeCell),
      rowLabels: makePool(labelLayer, makeText),
      ivs: makePool(ivLayer, makeCell),
    };
  },

  render(frame) {
    const v = view;
    if (!v) return;
    const state = isRecord(frame.state) ? frame.state : {};
    const values: unknown[] = Array.isArray(state.values) ? state.values : [];
    const mode = parseMode(state.mode);
    const rows = parseRows(state.rows);
    const intervals = parseIntervals(state.intervals);
    const threshold = mode === 'bars' ? parseThreshold(state.threshold) : null;
    const highlights = isRecord(frame.meta?.highlights) ? frame.meta.highlights : {};
    const marks = layoutPointers(frame.meta?.pointers, values.length);

    // lưới cột chung; không có hàng phụ/khoảng thì trùng với lưới `values.length` cột của 1b
    const grid = layoutGrid(values.length, rows, intervals);
    const lead = -grid.colStart;
    const x0 = PAD_X + (rows.length > 0 ? LABEL_W : 0);
    const plotW = VIEW_W - PAD_X - x0;
    const slot = plotW / Math.max(grid.cols, 1);
    const colX = (col: number) => x0 + (col + lead) * slot;
    const cellW = Math.max(Math.min(slot - 2, MAX_CELL_W), 1);

    v.svg.setAttribute('aria-label', describeArray(values, highlights, marks, rows, intervals));

    let mainH = VIEW_H;
    let pointerY = POINTER_Y;
    if (mode === 'bars') {
      const padded = [
        ...Array<number>(lead).fill(0),
        ...values,
        ...Array<number>(grid.cols - lead - values.length).fill(0),
      ];
      const layout = layoutBars(padded, plotW, PLOT_H, threshold ? [threshold.value] : []);
      const baseY = PLOT_TOP + layout.baseline;
      v.axis.setAttribute('transform', `translate(0 ${f(baseY)})`);
      const axisLine = v.axis.firstElementChild!;
      axisLine.setAttribute('x1', f(x0));
      axisLine.setAttribute('x2', String(VIEW_W - PAD_X));

      while (v.bars.length < values.length) v.bars.push(createBar(v));
      for (const b of v.bars.splice(values.length)) {
        b.g.remove();
        b.index.remove();
      }
      for (let i = 0; i < values.length; i++) {
        const box = layout.bars[lead + i];
        const bar = v.bars[i];
        const cx = x0 + box.cx;
        bar.g.setAttribute('transform', `translate(${f(cx)} ${f(baseY)})`);
        bar.rect.setAttribute('x', f(-box.width / 2));
        bar.rect.setAttribute('y', f(box.y - layout.baseline));
        bar.rect.setAttribute('width', f(box.width));
        bar.rect.setAttribute('height', f(box.height));
        bar.rect.setAttribute('class', hlClass('wta-bar', highlights[String(i)]));
        // nhãn giá trị: trên đỉnh cột dương (và cột 0), dưới đáy cột âm
        const labelY =
          box.value < 0 ? box.y - layout.baseline + box.height + 12 : box.y - layout.baseline - 4;
        bar.valueG.setAttribute('transform', `translate(0 ${f(labelY)})`);
        bar.value.textContent = String(values[i]);
        bar.index.setAttribute('x', f(cx));
        bar.index.textContent = String(i);
      }

      if (threshold) {
        v.thr.removeAttribute('display');
        v.thr.firstElementChild!.setAttribute('x1', f(x0));
        v.thr.firstElementChild!.setAttribute('x2', String(VIEW_W - PAD_X));
        v.thr.setAttribute(
          'transform',
          `translate(0 ${f(baseY - threshold.value * layout.scale)})`,
        );
        v.thrText.textContent = `${threshold.label} = ${threshold.value}`;
      } else {
        v.thr.setAttribute('display', 'none');
      }
    } else {
      // cells / bits: bỏ cột và vạch ngưỡng
      for (const b of v.bars.splice(0)) {
        b.g.remove();
        b.index.remove();
      }
      v.thr.setAttribute('display', 'none');
      const bits = mode === 'bits';
      const w = bits ? Math.min(cellW, MAX_BIT_W) : cellW;
      const chars = Math.max(Math.floor((w - 4) / CHAR_W), 1);
      const axisLine = v.axis.firstElementChild!;
      axisLine.setAttribute('x1', f(x0));
      axisLine.setAttribute('x2', f(x0));
      v.axis.setAttribute('transform', 'translate(0 0)');
      for (let i = 0; i < values.length; i++) {
        const raw = values[i];
        const text = raw === null || raw === undefined ? '' : String(raw);
        const x = colX(i) + (slot - w) / 2;
        const cls = hlClass(
          bits && text !== '' && text !== '0' ? 'wta-cell wta-bit1' : 'wta-cell',
          highlights[String(i)],
        );
        placeCell(
          take(v.cells, String(i)),
          x,
          CELL_Y,
          w,
          CELL_H,
          clipText(text, chars),
          cls,
          bits ? 'wta-bitv' : 'wta-val',
        );
        placeText(
          take(v.indexes, String(i)),
          x + w / 2,
          CELL_Y + CELL_H + 14,
          String(i),
          'wta-idx',
        );
      }
      pointerY = CELL_Y + CELL_H + 20;
      mainH = pointerY + (marks.length > 0 ? 26 : 0) + BLOCK_GAP;
    }
    sweep(v.cells); // chế độ bars không `take` gì nên dọn sạch ô của chế độ trước
    sweep(v.indexes);

    // con trỏ dưới chỉ số của hàng chính
    const seen = new Set<string>();
    for (const m of marks) {
      seen.add(m.name);
      let p = v.pointers.get(m.name);
      if (!p) {
        p = createPointer(v, m.name);
        v.pointers.set(m.name, p);
      }
      const x = colX(m.index) + slot / 2 + (m.lane - (m.lanes - 1) / 2) * LANE_W;
      p.g.setAttribute('transform', `translate(${f(x)} ${pointerY})`);
      p.text.textContent = m.label;
    }
    for (const [name, p] of v.pointers) {
      if (seen.has(name)) continue;
      p.g.remove();
      v.pointers.delete(name);
    }

    // hàng phụ
    let y = mainH;
    const rw = Math.max(Math.min(slot - 2, MAX_CELL_W), 1);
    const rowChars = Math.max(Math.floor((rw - 4) / CHAR_W), 1);
    rows.forEach((row, k) => {
      row.values.forEach((cv, i) => {
        const empty = cv === null;
        const x = colX(row.offset + i) + (slot - rw) / 2;
        placeCell(
          take(v.rowCells, `${k}:${i}`),
          x,
          y,
          rw,
          ROW_H,
          empty ? '' : clipText(String(cv), rowChars),
          hlClass(empty ? 'wta-cell wta-empty' : 'wta-cell', highlights[`r${k}:${i}`]),
          'wta-val',
        );
      });
      placeText(
        take(v.rowLabels, String(k)),
        x0 - 6,
        y + ROW_H / 2 + 4,
        clipText(row.label, Math.floor((LABEL_W - 6) / CHAR_W)),
        'wta-rowl',
      );
      y += ROW_PITCH;
    });
    sweep(v.rowCells);
    sweep(v.rowLabels);

    // khoảng
    const lanes = layoutIntervalLanes(intervals);
    if (intervals.length > 0) y += BLOCK_GAP;
    intervals.forEach((iv, i) => {
      const x = colX(iv.start);
      const w = Math.max((iv.end - iv.start) * slot, 2);
      placeCell(
        take(v.ivs, iv.id),
        x,
        y + lanes[i] * LANE_PITCH,
        w,
        LANE_H,
        clipText(iv.label, Math.floor((w - 4) / CHAR_W)),
        hlClass('wta-iv', highlights[iv.id]),
        'wta-ivl',
      );
    });
    sweep(v.ivs);
    const laneCount = lanes.length > 0 ? Math.max(...lanes) + 1 : 0;
    const totalH = y + laneCount * LANE_PITCH + (y > mainH ? BOTTOM_PAD : 0);

    v.svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${f(Math.max(totalH, mainH))}`);
  },

  destroy() {
    view?.host.replaceChildren();
    view = null;
  },
};
