/**
 * Visualizer `tree` (ARCHITECTURE §8). Chạy trong iframe null-origin: không Node API.
 * State: `{ nodes: { id, label, parent?, note?, edgeLabel? }[] }` là một RỪNG: node không có `parent` là gốc,
 * thứ tự con theo thứ tự trong mảng, tối đa 31 node. Khoá `highlights` là id node; kind dùng chung
 * `active|compare|result|visited|muted|group-0…group-5`. `pointers` là `{ tên: idNode }`, vẽ nhãn phía trên node.
 * SVG dựng bằng `createElementNS`; dữ liệu vào DOM chỉ qua `textContent`/`setAttribute`.
 * Class riêng có tiền tố `wtt-`; màu lấy từ biến CSS của shell (`--wt-*`); chuyển động bằng CSS transition.
 */
import type { VisualizerRenderer } from '@/lib/tutor/protocol/widget-data';
import { isRecord } from '@/lib/tutor/runtime/layout';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MAX_NODES = 31;
const VIEW_W = 480;
const PAD_X = 12;
const PAD_TOP = 44; // chừa chỗ cho nhãn con trỏ xếp chồng phía trên node gốc
const PAD_BOTTOM = 20; // chừa chỗ cho `note` của hàng cuối
const CELL_H = 56; // chiều cao một tầng: đủ cho node (r ≤ 16), `note` bên dưới và khoảng hở tới tầng sau
const MIN_PLOT_H = 112;
const MAX_PLOT_H = 448;
const MAX_R = 16;
const POINTER_LANE_H = 12;
const KINDS = new Set(['active', 'compare', 'result', 'visited', 'muted']);
const GROUPS = 6;
const GROUP_KIND = /^group-([0-5])$/;

/**
 * Bảng màu `group-0…5` (shell chưa định nghĩa nên khai báo trong CSS của visualizer). Mỗi nhóm khác nhau cả
 * về màu lẫn nét viền (`GROUP_DASH`), nên không phân biệt chỉ bằng màu. Chữ dùng `--wt-fg` của shell:
 * nền sáng/tối chọn để tương phản chữ >= 4.5:1, viền >= 3:1 với `--wt-bg` (test `tree-layout`).
 */
export const GROUP_PALETTE = {
  light: {
    bg: '#ffffff',
    fg: '#1f2937',
    fill: ['#fecaca', '#bfdbfe', '#bbf7d0', '#fde68a', '#e9d5ff', '#fbcfe8'],
    stroke: ['#b91c1c', '#1d4ed8', '#15803d', '#92400e', '#7e22ce', '#be185d'],
  },
  dark: {
    bg: '#111827',
    fg: '#e5e7eb',
    fill: ['#7f1d1d', '#1e3a8a', '#14532d', '#78350f', '#581c87', '#831843'],
    stroke: ['#f87171', '#60a5fa', '#4ade80', '#fbbf24', '#c084fc', '#f472b6'],
  },
} as const;
const GROUP_DASH = ['none', '5 3', '1 3', '8 3 2 3', '6 6', '2 2 8 2'] as const;

const groupVars = (p: { fill: readonly string[]; stroke: readonly string[] }) =>
  p.fill.map((c, k) => `--wtt-gf${k}:${c};--wtt-gs${k}:${p.stroke[k]}`).join(';');
const groupRules = GROUP_DASH.map(
  (d, k) =>
    `.wtt-node.wtt-g${k}{fill:var(--wtt-gf${k});stroke:var(--wtt-gs${k});stroke-width:3px;stroke-dasharray:${d}}`,
).join('\n');

const CSS = `
:root{${groupVars(GROUP_PALETTE.light)}}
@media (prefers-color-scheme:dark){:root{${groupVars(GROUP_PALETTE.dark)}}}
.wtt{display:block;inline-size:100%;block-size:auto;direction:ltr}
.wtt text{fill:var(--wt-fg,#1f2937);font:11px/1 system-ui,sans-serif;text-anchor:middle}
.wtt text.wtt-note{fill:var(--wt-mut,#6b7280);font-size:10px}
.wtt text.wtt-edge{fill:var(--wt-mut,#6b7280);font-size:10px;paint-order:stroke;stroke:var(--wt-bg,#fff);stroke-width:3px;stroke-linejoin:round}
:where(.wtt-node){fill:var(--wt-bg,#fff);stroke:var(--wt-mut,#6b7280);stroke-width:1.5}
.wtt-link{fill:none;stroke:var(--wt-mut,#6b7280);stroke-width:1.5}
.wtt-ptr text{fill:var(--wt-acc,#2563eb);font-weight:600}
${groupRules}
.wtt g,.wtt circle{transition:transform .3s ease,fill .3s,opacity .3s,stroke .3s,stroke-width .3s}
.wtt-link{transition:d .3s ease}
`.trim();

// --- bố cục thuần (toạ độ trong vùng vẽ [0,width] × [0,height]) ---

export interface ForestNode {
  id: string;
  label: string;
  parent?: string;
  note?: string;
  edgeLabel?: string;
}

export interface NodeBox {
  id: string;
  /** Tâm node. */
  x: number;
  y: number;
  /** 0 = gốc. */
  depth: number;
  /** id cha nếu cha có trong rừng. */
  parent?: string;
}

export interface ForestLayout {
  nodes: NodeBox[];
  /** Bán kính node, chung cho mọi node. */
  r: number;
  /** Số tầng (độ sâu lớn nhất + 1); 0 nếu rừng rỗng. */
  levels: number;
}

/**
 * Cây gọn: mỗi lá một cột (đều nhau), cha nằm giữa con đầu và con cuối, tầng theo độ sâu; các cây trong
 * rừng đứng cạnh nhau theo thứ tự gốc trong mảng. Hai node cùng tầng cách nhau >= một cột nên không chồng.
 * Chỉ lấy 31 node đầu. Bỏ qua id trùng; `parent` không có trong rừng coi như gốc; node nằm trong vòng cha-con
 * (không với tới từ gốc nào) bị bỏ.
 */
export function layoutForest(
  input: readonly ForestNode[],
  width: number,
  height: number,
): ForestLayout {
  const nodes: ForestNode[] = [];
  const known = new Set<string>();
  for (const n of input) {
    if (nodes.length >= MAX_NODES) break;
    if (known.has(n.id)) continue;
    known.add(n.id);
    nodes.push(n);
  }
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const n of nodes) {
    if (n.parent !== undefined && n.parent !== n.id && known.has(n.parent)) {
      const list = children.get(n.parent) ?? [];
      list.push(n.id);
      children.set(n.parent, list);
    } else if (n.parent === undefined || !known.has(n.parent)) roots.push(n.id);
  }

  // slot: cột (có thể lẻ) của node; lá nhận cột nguyên liên tiếp
  const placed = new Map<string, { slot: number; depth: number; parent?: string }>();
  let nextLeaf = 0;
  let maxDepth = -1;
  const visit = (id: string, depth: number, parent?: string): number => {
    placed.set(id, { slot: 0, depth, parent }); // chặn vòng lặp: node đã vào Map thì không thăm lại
    if (depth > maxDepth) maxDepth = depth;
    const kids = (children.get(id) ?? []).filter((c) => !placed.has(c));
    const slots = kids.map((c) => visit(c, depth + 1, id));
    const slot = slots.length > 0 ? (slots[0] + slots[slots.length - 1]) / 2 : nextLeaf++;
    placed.get(id)!.slot = slot;
    return slot;
  };
  for (const id of roots) visit(id, 0);

  const levels = maxDepth + 1;
  const slotW = nextLeaf > 0 ? width / nextLeaf : 0;
  const cellH = levels > 0 ? height / levels : 0;
  const r = Math.min(MAX_R, slotW * 0.4, cellH * 0.4);
  const boxes: NodeBox[] = [];
  for (const n of nodes) {
    const p = placed.get(n.id);
    if (!p) continue;
    boxes.push({
      id: n.id,
      x: (p.slot + 0.5) * slotW,
      y: (p.depth + 0.5) * cellH,
      depth: p.depth,
      parent: p.parent,
    });
  }
  return { nodes: boxes, r, levels };
}

/** `nodes` hợp lệ từ state thô: bỏ phần tử không phải object hoặc id rỗng; kiểu sai thì bỏ trường đó. */
export function parseNodes(raw: unknown): ForestNode[] {
  if (!Array.isArray(raw)) return [];
  const out: ForestNode[] = [];
  for (const x of raw) {
    if (!isRecord(x)) continue;
    const id = typeof x.id === 'string' || typeof x.id === 'number' ? String(x.id) : '';
    if (id === '') continue;
    const str = (v: unknown) =>
      typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
    out.push({
      id,
      label: str(x.label) ?? id,
      parent: str(x.parent),
      note: str(x.note),
      edgeLabel: str(x.edgeLabel),
    });
  }
  return out;
}

export interface PointerMark {
  name: string;
  /** id node mà con trỏ chỉ tới. */
  node: string;
  /** Vị trí trong nhóm con trỏ cùng node (0 = sát node nhất). */
  lane: number;
}

/** Con trỏ chỉ tới id không có trong `ids` thì bỏ. */
export function layoutPointers(pointers: unknown, ids: ReadonlySet<string>): PointerMark[] {
  if (!isRecord(pointers)) return [];
  const perNode = new Map<string, number>();
  const marks: PointerMark[] = [];
  for (const [name, raw] of Object.entries(pointers)) {
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const node = String(raw);
    if (!ids.has(node)) continue;
    const lane = perNode.get(node) ?? 0;
    perNode.set(node, lane + 1);
    marks.push({ name, node, lane });
  }
  return marks;
}

/** Kind hợp lệ của một node (`active`… hoặc `group-k`), ngược lại `null`. */
function kindOf(highlights: Readonly<Record<string, unknown>>, id: string): string | null {
  const k = highlights[id];
  return typeof k === 'string' && (KINDS.has(k) || GROUP_KIND.test(k)) ? k : null;
}

/**
 * Mô tả cho trình đọc màn hình, mỗi node một mục: `B (con của A, compare, con trỏ cur, ghi chú fail→B)`;
 * gốc ghi `gốc` chứ không có "con của". Thứ tự theo `layout.nodes` (cha trước con).
 */
export function describeForest(
  nodes: readonly ForestNode[],
  layout: ForestLayout,
  highlights: Readonly<Record<string, unknown>>,
  marks: readonly PointerMark[],
): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return layout.nodes
    .map((box) => {
      const n = byId.get(box.id)!;
      const parent = box.parent !== undefined ? byId.get(box.parent) : undefined;
      const notes = [
        parent ? `con của ${parent.label}` : 'gốc',
        ...(kindOf(highlights, n.id) ? [kindOf(highlights, n.id)!] : []),
        ...marks.filter((m) => m.node === n.id).map((m) => m.name),
        ...(n.edgeLabel ? [`cạnh ${n.edgeLabel}`] : []),
        ...(n.note ? [n.note] : []),
      ];
      return `${n.label} (${notes.join(', ')})`;
    })
    .join('; ');
}

// --- vẽ ---

interface NodeEls {
  g: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  note: SVGTextElement;
  linkG: SVGGElement;
  link: SVGPathElement;
  edge: SVGTextElement;
}

interface View {
  host: HTMLElement;
  svg: SVGSVGElement;
  plot: SVGGElement;
  linkLayer: SVGGElement;
  nodeLayer: SVGGElement;
  pointerLayer: SVGGElement;
  nodes: Map<string, NodeEls>;
  pointers: Map<string, { g: SVGGElement; text: SVGTextElement }>;
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

function createNode(v: View, id: string): NodeEls {
  const doc = v.host.ownerDocument;
  const g = svgEl(doc, 'g', { 'data-node': id });
  const circle = svgEl(doc, 'circle', { class: 'wtt-node' });
  const label = svgEl(doc, 'text', { dy: '0.35em' });
  const note = svgEl(doc, 'text', { class: 'wtt-note' });
  g.append(circle, label, note);
  const linkG = svgEl(doc, 'g');
  const link = svgEl(doc, 'path', { class: 'wtt-link' });
  const edge = svgEl(doc, 'text', { class: 'wtt-edge' });
  linkG.append(link, edge);
  v.nodeLayer.appendChild(g);
  v.linkLayer.appendChild(linkG);
  return { g, circle, label, note, linkG, link, edge };
}

export const treeVisualizer: VisualizerRenderer = {
  type: 'tree',

  mount(el) {
    const doc = el.ownerDocument;
    const style = doc.createElement('style');
    style.textContent = CSS;
    const svg = svgEl(doc, 'svg', { class: 'wtt', role: 'img' });
    const plot = svgEl(doc, 'g', { transform: `translate(${PAD_X} ${PAD_TOP})` });
    const linkLayer = svgEl(doc, 'g');
    const nodeLayer = svgEl(doc, 'g');
    const pointerLayer = svgEl(doc, 'g');
    plot.append(linkLayer, nodeLayer, pointerLayer);
    svg.appendChild(plot);
    el.replaceChildren(style, svg);
    view = {
      host: el,
      svg,
      plot,
      linkLayer,
      nodeLayer,
      pointerLayer,
      nodes: new Map(),
      pointers: new Map(),
    };
  },

  render(frame) {
    const v = view;
    if (!v) return;
    const state = isRecord(frame.state) ? frame.state : {};
    const nodes = parseNodes(state.nodes);
    const highlights = isRecord(frame.meta?.highlights) ? frame.meta.highlights : {};

    const w = VIEW_W - 2 * PAD_X;
    const levels = layoutForest(nodes, w, 1).levels;
    const plotH = Math.min(Math.max(levels * CELL_H, MIN_PLOT_H), MAX_PLOT_H);
    const layout = layoutForest(nodes, w, plotH);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const pos = new Map(layout.nodes.map((b) => [b.id, b]));
    const marks = layoutPointers(frame.meta?.pointers, new Set(pos.keys()));

    v.svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${PAD_TOP + plotH + PAD_BOTTOM}`);
    v.svg.setAttribute('aria-label', describeForest(nodes, layout, highlights, marks));

    const { r } = layout;
    for (const box of layout.nodes) {
      const n = byId.get(box.id)!;
      let els = v.nodes.get(box.id);
      if (!els) {
        els = createNode(v, box.id);
        v.nodes.set(box.id, els);
      }
      els.g.setAttribute('transform', `translate(${f(box.x)} ${f(box.y)})`);
      els.circle.setAttribute('r', f(r));
      const kind = kindOf(highlights, box.id);
      const group = kind ? GROUP_KIND.exec(kind) : null;
      els.circle.setAttribute(
        'class',
        !kind ? 'wtt-node' : group ? `wtt-node wtt-g${group[1]}` : `wtt-node wt-hl-${kind}`,
      );
      els.label.textContent = n.label;
      // nhãn dài thì thu nhỏ chữ cho vừa trong node (đủ chữ vẫn có trong aria-label)
      els.label.setAttribute(
        'font-size',
        f(Math.min(11, Math.max(7, (2 * r * 0.85) / (0.6 * Math.max(n.label.length, 1))))),
      );
      els.note.textContent = n.note ?? '';
      els.note.setAttribute('y', f(r + 11));

      const parent = box.parent !== undefined ? pos.get(box.parent) : undefined;
      if (parent) {
        els.linkG.removeAttribute('display');
        const d = `M${f(parent.x)} ${f(parent.y)}L${f(box.x)} ${f(box.y)}`;
        els.link.setAttribute('d', d);
        els.link.style.setProperty('d', `path("${d}")`); // CSS `d` cho phép chuyển động mượt; thuộc tính `d` là dự phòng
        els.edge.setAttribute(
          'transform',
          `translate(${f((parent.x + box.x) / 2)} ${f((parent.y + box.y) / 2)})`,
        );
        els.edge.textContent = n.edgeLabel ?? '';
      } else {
        els.linkG.setAttribute('display', 'none');
      }
    }
    for (const [id, els] of [...v.nodes]) {
      if (pos.has(id)) continue;
      els.g.remove();
      els.linkG.remove();
      v.nodes.delete(id);
    }

    const seen = new Set<string>();
    for (const m of marks) {
      seen.add(m.name);
      let p = v.pointers.get(m.name);
      if (!p) {
        const doc = v.host.ownerDocument;
        const g = svgEl(doc, 'g', { class: 'wtt-ptr', 'data-pointer': m.name });
        const text = svgEl(doc, 'text');
        g.appendChild(text);
        v.pointerLayer.appendChild(g);
        p = { g, text };
        v.pointers.set(m.name, p);
      }
      const box = pos.get(m.node)!;
      p.g.setAttribute(
        'transform',
        `translate(${f(box.x)} ${f(box.y - r - 5 - m.lane * POINTER_LANE_H)})`,
      );
      p.text.textContent = `${m.name} ↓`;
    }
    for (const [name, p] of [...v.pointers]) {
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
