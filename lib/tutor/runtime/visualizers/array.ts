/**
 * Visualizer `array`, chế độ `bars` (ARCHITECTURE §8). Chạy trong iframe null-origin: không Node API.
 * SVG dựng bằng `createElementNS`; dữ liệu vào DOM chỉ qua `textContent`/`setAttribute`.
 * State: `{ values, mode: 'bars', threshold?: { value, label } }`. Khoá `highlights` là chỉ số
 * dạng chuỗi; `pointers` (`lo`/`hi`/`mid`…) là mũi tên có nhãn dưới chỉ số.
 * Class riêng có tiền tố `wta-`; màu lấy từ biến CSS của shell (`--wt-*`); chuyển động bằng CSS transition.
 */
import type { VisualizerRenderer } from '@/lib/tutor/protocol/widget-data';
import { isRecord } from '@/lib/tutor/runtime/layout';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 480;
const VIEW_H = 232;
const PAD_X = 16;
const PLOT_TOP = 28; // chừa chỗ cho nhãn giá trị của cột cao nhất và nhãn vạch ngưỡng
const PLOT_H = 130;
const INDEX_Y = 184;
const POINTER_Y = 194;
const LANE_W = 20; // các con trỏ cùng một chỉ số dàn ngang trong ô
const MAX_BAR_W = 56;
const MIN_BAR_H = 2; // cột khác 0 luôn nhìn thấy được (giá trị nhỏ trên thang lớn)
const KINDS = new Set(['active', 'compare', 'result', 'visited', 'muted']);

const CSS = `
.wta{display:block;inline-size:100%;block-size:auto;direction:ltr}
.wta text{fill:var(--wt-fg,#1f2937);font:11px/1 system-ui,sans-serif;text-anchor:middle}
.wta text.wta-idx{fill:var(--wt-mut,#6b7280)}
:where(.wta-bar){fill:var(--wt-bg,#fff);stroke:var(--wt-mut,#6b7280);stroke-width:1}
.wta-axis{stroke:var(--wt-mut,#6b7280);stroke-width:1}
.wta-thr line{stroke:var(--wt-err,#dc2626);stroke-width:1.5;stroke-dasharray:6 4}
.wta-thr text{fill:var(--wt-err,#dc2626);text-anchor:end}
.wta-ptr polygon{fill:var(--wt-acc,#2563eb)}
.wta-ptr text{fill:var(--wt-acc,#2563eb);font-weight:600}
.wta-bar.wt-hl-muted{opacity:1}
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
    const axis = svgEl(doc, 'g');
    axis.appendChild(
      svgEl(doc, 'line', { class: 'wta-axis', x1: String(PAD_X), x2: String(VIEW_W - PAD_X) }),
    );
    const barLayer = svgEl(doc, 'g');
    const thr = svgEl(doc, 'g', { class: 'wta-thr', display: 'none' });
    thr.appendChild(
      svgEl(doc, 'line', { x1: String(PAD_X), x2: String(VIEW_W - PAD_X), y1: '0', y2: '0' }),
    );
    const thrText = svgEl(doc, 'text', { x: String(VIEW_W - PAD_X), y: '-4' });
    thr.appendChild(thrText);
    const indexLayer = svgEl(doc, 'g');
    const pointerLayer = svgEl(doc, 'g');
    svg.append(axis, barLayer, thr, indexLayer, pointerLayer);
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
    };
  },

  render(frame) {
    const v = view;
    if (!v) return;
    const state = isRecord(frame.state) ? frame.state : {};
    const values: unknown[] = Array.isArray(state.values) ? state.values : [];
    const threshold = parseThreshold(state.threshold);
    const highlights = isRecord(frame.meta?.highlights) ? frame.meta.highlights : {};
    const layout = layoutBars(
      values,
      VIEW_W - 2 * PAD_X,
      PLOT_H,
      threshold ? [threshold.value] : [],
    );
    const baseY = PLOT_TOP + layout.baseline;

    const marks = layoutPointers(frame.meta?.pointers, values.length);
    v.svg.setAttribute('aria-label', describeBars(values, highlights, marks));
    v.axis.setAttribute('transform', `translate(0 ${f(baseY)})`);

    while (v.bars.length < values.length) v.bars.push(createBar(v));
    for (const b of v.bars.splice(values.length)) {
      b.g.remove();
      b.index.remove();
    }
    for (const box of layout.bars) {
      const bar = v.bars[box.index];
      const kind = highlights[String(box.index)];
      const cx = PAD_X + box.cx;
      bar.g.setAttribute('transform', `translate(${f(cx)} ${f(baseY)})`);
      bar.rect.setAttribute('x', f(-box.width / 2));
      bar.rect.setAttribute('y', f(box.y - layout.baseline));
      bar.rect.setAttribute('width', f(box.width));
      bar.rect.setAttribute('height', f(box.height));
      bar.rect.setAttribute(
        'class',
        typeof kind === 'string' && KINDS.has(kind) ? `wta-bar wt-hl-${kind}` : 'wta-bar',
      );
      // nhãn giá trị: trên đỉnh cột dương (và cột 0), dưới đáy cột âm
      const labelY =
        box.value < 0 ? box.y - layout.baseline + box.height + 12 : box.y - layout.baseline - 4;
      bar.valueG.setAttribute('transform', `translate(0 ${f(labelY)})`);
      bar.value.textContent = String(values[box.index]);
      bar.index.setAttribute('x', f(cx));
      bar.index.textContent = String(box.index);
    }

    if (threshold) {
      v.thr.removeAttribute('display');
      v.thr.setAttribute('transform', `translate(0 ${f(baseY - threshold.value * layout.scale)})`);
      v.thrText.textContent = `${threshold.label} = ${threshold.value}`;
    } else {
      v.thr.setAttribute('display', 'none');
    }

    const slot = (VIEW_W - 2 * PAD_X) / Math.max(values.length, 1);
    const seen = new Set<string>();
    for (const m of marks) {
      seen.add(m.name);
      let p = v.pointers.get(m.name);
      if (!p) {
        p = createPointer(v, m.name);
        v.pointers.set(m.name, p);
      }
      const x = PAD_X + (m.index + 0.5) * slot + (m.lane - (m.lanes - 1) / 2) * LANE_W;
      p.g.setAttribute('transform', `translate(${f(x)} ${POINTER_Y})`);
      p.text.textContent = m.label;
    }
    for (const [name, p] of v.pointers) {
      if (seen.has(name)) continue;
      p.g.remove();
      v.pointers.delete(name);
    }
  },

  destroy() {
    view?.host.replaceChildren();
    view = null;
  },
};
