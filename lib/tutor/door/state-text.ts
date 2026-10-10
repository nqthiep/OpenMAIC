/**
 * A frame's picture, written as text, for practice questions (a quiz page has no canvas). One reader per
 * visualizer whose picture carries data the sentence does not: the DP table, the graph, the tree and the
 * array. Pure. Returns null for a state it cannot read or that is too large to be worth reading.
 */
export type StateLines = readonly string[];

const WORDS: Readonly<
  Record<string, { nodes: string; edges: string; table: string; parent: string }>
> = {
  'vi-VN': { nodes: 'Đỉnh', edges: 'Cạnh', table: 'Bảng', parent: 'cha' },
  'en-US': { nodes: 'Nodes', edges: 'Edges', table: 'Table', parent: 'parent' },
};
type Words = (typeof WORDS)[string];

const MAX_ROWS = 16;
const MAX_COLS = 13;
const MAX_ITEMS = 24;
const MAX_CHARS = 700;

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : null;
const text = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';

/** A row of cells: numbers or short strings; a missing value is a dot. */
function cellsOf(values: unknown[]): string {
  const shown = values.slice(0, MAX_ITEMS).map((v) => text(v) || '·');
  return `${shown.join(', ')}${values.length > MAX_ITEMS ? ', …' : ''}`;
}

const isCells = (v: unknown): v is unknown[] =>
  Array.isArray(v) && v.every((x) => x === null || ['string', 'number'].includes(typeof x));

function array(state: Rec): StateLines | null {
  if (!isCells(state.values)) return null;
  const lines = [`a = [${cellsOf(state.values)}]`];
  // extra labelled rows, e.g. the pattern under the text, with the column it starts at
  if (Array.isArray(state.rows)) {
    for (const row of state.rows) {
      const r = rec(row);
      if (!r || !isCells(r.values)) continue;
      const at = typeof r.offset === 'number' && r.offset > 0 ? ` @${r.offset}` : '';
      lines.push(`${text(r.label) || '·'}${at}: [${cellsOf(r.values)}]`);
    }
  }
  return lines;
}

function grid(state: Rec, w: Words): StateLines | null {
  const cells = state.cells;
  if (!Array.isArray(cells) || cells.length === 0 || cells.length > MAX_ROWS) return null;
  if (!cells.every((r) => Array.isArray(r) && r.length <= MAX_COLS)) return null;
  const rowLabels = Array.isArray(state.rowLabels) ? state.rowLabels : [];
  const colLabels = Array.isArray(state.colLabels) ? state.colLabels : [];
  const lines: string[] = [`${w.table}:`];
  if (colLabels.length > 0) lines.push(`· | ${colLabels.map(text).join(' | ')}`);
  (cells as unknown[][]).forEach((row, r) => {
    const cell = (c: unknown) => text(c) || '·';
    lines.push(`${text(rowLabels[r]) || r} | ${row.map(cell).join(' | ')}`);
  });
  return lines;
}

function graph(state: Rec, w: Words): StateLines | null {
  if (!Array.isArray(state.nodes) || !Array.isArray(state.edges)) return null;
  if (state.nodes.length > MAX_ITEMS || state.edges.length > MAX_ITEMS * 2) return null;
  const nodes = state.nodes.flatMap((n) => {
    const r = rec(n);
    return r && text(r.id) ? [{ id: text(r.id), label: text(r.label) || text(r.id) }] : [];
  });
  const edges = state.edges.flatMap((e) => {
    const r = rec(e);
    if (!r || !text(r.from) || !text(r.to)) return [];
    const extra = [text(r.weight), text(r.label)].filter(Boolean).join(' ');
    return [
      `${text(r.from)}${r.directed === true ? '→' : '–'}${text(r.to)}${extra ? ` (${extra})` : ''}`,
    ];
  });
  return [
    `${w.nodes}: ${nodes.map((n) => n.label).join(', ')}`,
    `${w.edges}: ${edges.join(', ') || '∅'}`,
  ];
}

function tree(state: Rec, w: Words): StateLines | null {
  if (!Array.isArray(state.nodes) || state.nodes.length > MAX_ITEMS * 2) return null;
  const lines = state.nodes.flatMap((n) => {
    const r = rec(n);
    if (!r || !text(r.id)) return [];
    const note = text(r.note);
    const parent = text(r.parent);
    return [
      `${text(r.id)}: ${text(r.label) || text(r.id)}${note ? ` = ${note}` : ''}${parent ? ` (${w.parent} ${parent})` : ''}`,
    ];
  });
  return lines;
}

const READERS: Readonly<Record<string, (state: Rec, w: Words) => StateLines | null>> = {
  array,
  grid,
  graph,
  tree,
};

/** The readable state of `visualizer`'s frame, or null (unknown visualizer, unreadable or too big). */
export function readState(visualizer: string, state: unknown, locale: string): StateLines | null {
  const s = rec(state);
  const read = Object.hasOwn(READERS, visualizer) ? READERS[visualizer] : undefined;
  if (!s || !read) return null;
  const out = read(s, WORDS[locale] ?? WORDS['en-US']);
  if (!out) return null;
  return out.join('\n').length > MAX_CHARS ? null : out;
}

/** Visualizers whose state `readState` can read; practice for the others rests on the explanation alone. */
export function hasStateReader(visualizer: string): boolean {
  return Object.hasOwn(READERS, visualizer);
}
