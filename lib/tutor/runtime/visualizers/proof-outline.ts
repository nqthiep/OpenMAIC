/**
 * Visualizer `proofOutline` (ARCHITECTURE §8; task 3B-V3): cây chứng minh "cho / cần chứng minh / có / do / suy ra",
 * thụt lề theo `parent`. Chạy trong iframe null-origin: không Node API. DOM dựng bằng `createElement`; chữ vào DOM
 * chỉ qua `textContent`, trừ công thức: HTML KaTeX do server dựng (`config.math`, xem `rich-text.ts`).
 * State: `{ nodes:{ id, kind:'given'|'goal'|'have'|'because'|'therefore', text, parent?, status?:'pending'|'done' }[] }`.
 * `parent` phải là id của một node đứng trước nó trong danh sách; ngược lại node là gốc (không có vòng).
 * Khoá `highlights` là id node. Kind: `active|compare|result|visited|muted` (lớp `wt-hl-*` của shell) và
 * `group-0..5` (lớp `wtq-g0..5`: nền và viền trái riêng, cùng bảng màu với `grid`).
 * Mỗi node có nhãn loại bằng chữ (không phân biệt chỉ bằng màu). Giới hạn: 40 node, sâu 5 cấp, mỗi `text` ≤ 300 ký tự.
 */
import type { VisualizerRenderer } from '@/lib/tutor/protocol/widget-data';
import { isRecord } from '@/lib/tutor/runtime/layout';
import { setRichText, type MathTable } from '@/lib/tutor/runtime/rich-text';
import { GROUP_PALETTE } from '@/lib/tutor/runtime/visualizers/grid';

export const MAX_NODES = 40;
export const MAX_DEPTH = 5;
export const MAX_TEXT = 300;
export const PROOF_KINDS = ['given', 'goal', 'have', 'because', 'therefore'] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];
const SHELL_KINDS = ['active', 'compare', 'result', 'visited', 'muted'];
const KINDS = new Set([...SHELL_KINDS, ...Array.from({ length: 6 }, (_, i) => `group-${i}`)]);
const INDENT_PX = 18;

const groupRules = (scheme: 'light' | 'dark') =>
  GROUP_PALETTE.map(
    (g, i) =>
      `.wtq-g${i}{background:${g[scheme].fill};border-inline-start-color:${g[scheme].stroke};border-inline-start-width:${g.width + 2}px;border-inline-start-style:${g.dash === 'none' ? 'solid' : 'dashed'}}`,
  ).join('');

const CSS = `
.wtq{margin:0;padding:0;list-style:none;direction:ltr;font:14px/1.45 system-ui,sans-serif;color:var(--wt-fg,#1f2937)}
.wtq-row{display:flex;gap:8px;align-items:baseline;padding:5px 8px;margin:3px 0;border-inline-start:3px solid var(--wt-mut,#6b7280);border-radius:4px;background:var(--wt-bg,#fff);transition:background-color .3s,opacity .3s}
.wtq-kind{flex:none;min-inline-size:5.2em;font-size:12px;font-weight:600;color:var(--wt-mut,#6b7280);text-transform:none}
.wtq-text{flex:1;min-inline-size:0;overflow-wrap:anywhere}
.wtq-row[data-status=pending]{opacity:.7}
.wtq-row[data-status=done] .wtq-text::after{content:" ✓";font-weight:600}
.wtq-k-goal .wtq-kind{color:var(--wt-acc,#2563eb)}
.wtq-row.wt-hl-active,.wtq-row.wt-hl-compare,.wtq-row.wt-hl-result,.wtq-row.wt-hl-visited{border-inline-start-width:5px}
${groupRules('light')}
@media (prefers-color-scheme:dark){${groupRules('dark')}}
`.trim();

// --- giá trị ---

export interface ProofRow {
  readonly id: string;
  readonly kind: ProofKind;
  readonly text: string;
  /** 0 = gốc */
  readonly depth: number;
  readonly status: 'pending' | 'done' | null;
}

function cut(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, Math.max(max - 1, 0)).join('')}…`;
}

/**
 * Các node hợp lệ theo thứ tự hiển thị: gốc theo thứ tự trong danh sách, mỗi node ngay sau cha của nó.
 * Bỏ: không phải đối tượng, `id` rỗng hoặc trùng, `text` không phải chuỗi; `kind` lạ thành `have`;
 * `parent` không phải id của node đứng trước thì node là gốc; độ sâu kẹp ở `MAX_DEPTH`; tối đa `MAX_NODES`.
 */
export function proofRows(raw: unknown): ProofRow[] {
  const list = Array.isArray(raw) ? raw : [];
  type Node = {
    id: string;
    kind: ProofKind;
    text: string;
    parent: string | null;
    status: ProofRow['status'];
  };
  const nodes: Node[] = [];
  const seen = new Set<string>();
  for (const n of list) {
    if (nodes.length >= MAX_NODES) break;
    if (!isRecord(n) || typeof n.id !== 'string' || n.id === '' || seen.has(n.id)) continue;
    if (typeof n.text !== 'string') continue;
    const parent = typeof n.parent === 'string' && seen.has(n.parent) ? n.parent : null;
    seen.add(n.id);
    nodes.push({
      id: n.id,
      kind: (PROOF_KINDS as readonly string[]).includes(n.kind as string)
        ? (n.kind as ProofKind)
        : 'have',
      text: cut(n.text, MAX_TEXT),
      parent,
      status: n.status === 'done' || n.status === 'pending' ? n.status : null,
    });
  }
  const children = new Map<string | null, Node[]>();
  for (const n of nodes) children.set(n.parent, [...(children.get(n.parent) ?? []), n]);
  const rows: ProofRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const n of children.get(parent) ?? []) {
      rows.push({
        id: n.id,
        kind: n.kind,
        text: n.text,
        depth: Math.min(depth, MAX_DEPTH),
        status: n.status,
      });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** Mô tả cho trình đọc màn hình: mỗi node `kind: text` (kèm loại tô sáng); công thức đọc dưới dạng nguồn TeX. */
export function describeProof(
  rows: readonly ProofRow[],
  highlights: Readonly<Record<string, unknown>>,
  kindLabel: (kind: ProofKind) => string = (k) => k,
): string {
  return rows
    .map((r) => {
      const h = highlights[r.id];
      const tag = typeof h === 'string' && KINDS.has(h) ? ` (${h})` : '';
      return `${'  '.repeat(r.depth)}${kindLabel(r.kind)}${tag}: ${r.text}`;
    })
    .join('; ');
}

// --- vẽ ---

interface View {
  host: HTMLElement;
  list: HTMLElement;
  math: MathTable | undefined;
  labels: Record<string, string>;
}

let view: View | null = null;

function kindClass(kind: unknown): string {
  if (typeof kind !== 'string' || !KINDS.has(kind)) return '';
  return kind.startsWith('group-') ? ` wtq-g${kind.slice(6)}` : ` wt-hl-${kind}`;
}

export const proofOutlineVisualizer: VisualizerRenderer = {
  type: 'proofOutline',

  mount(el, config) {
    const doc = el.ownerDocument;
    const cfg = isRecord(config) ? config : {};
    const style = doc.createElement('style');
    style.textContent = CSS;
    const list = doc.createElement('ul');
    list.className = 'wtq';
    const labels: Record<string, string> = {};
    if (isRecord(cfg.labels)) {
      for (const [k, v] of Object.entries(cfg.labels)) if (typeof v === 'string') labels[k] = v;
    }
    el.replaceChildren(style, list);
    view = {
      host: el,
      list,
      math: isRecord(cfg.math) ? (cfg.math as MathTable) : undefined,
      labels,
    };
  },

  render(frame) {
    const v = view;
    if (!v) return;
    const doc = v.host.ownerDocument;
    const state = isRecord(frame.state) ? frame.state : {};
    const hl = isRecord(frame.meta?.highlights) ? frame.meta.highlights : {};
    const rows = proofRows(state.nodes);
    const kindLabel = (k: ProofKind) => v.labels[`proof.${k}`] ?? k;

    const items = rows.map((r) => {
      const li = doc.createElement('li');
      li.className = `wtq-row wtq-k-${r.kind}${kindClass(hl[r.id])}`;
      li.style.marginInlineStart = `${r.depth * INDENT_PX}px`;
      if (r.status) li.setAttribute('data-status', r.status);
      li.setAttribute('data-node', r.id);
      const kind = doc.createElement('span');
      kind.className = 'wtq-kind';
      kind.textContent = kindLabel(r.kind);
      const body = doc.createElement('span');
      body.className = 'wtq-text';
      setRichText(body, r.text, v.math);
      if (r.status === 'done')
        body.setAttribute('aria-label', `${r.text} (${v.labels['proof.done'] ?? 'done'})`);
      li.append(kind, body);
      return li;
    });
    v.list.setAttribute('aria-label', describeProof(rows, hl, kindLabel));
    v.list.replaceChildren(...items);
  },

  destroy() {
    view?.host.replaceChildren();
    view = null;
  },
};
