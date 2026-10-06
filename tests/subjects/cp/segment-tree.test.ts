import { describe, expect, it } from 'vitest';
import { segmentTreeEntry as entry } from '@/lib/subjects/cp/catalog/segment-tree';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { values: number[]; l: number; r: number };
type TreeNode = { id: string; label: string; parent?: string; note?: string };
type S = { nodes: TreeNode[] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const direct = ({ values, l, r }: In): number => {
  let s = 0;
  for (let i = l; i <= r; i++) s += values[i];
  return s;
};
const A8 = [5, 3, 8, 1, 9, 2, 7, 4];
const A4 = [6, -2, 4, 3];
/** Every query range over both array sizes. */
function* queries(): Generator<In> {
  for (const values of [A4, A8, [-99, 99, -99, 99, -99, 99, -99, 99]])
    for (let l = 0; l < values.length; l++)
      for (let r = l; r < values.length; r++) yield { values, l, r };
}
const ALL = [...queries()];
const PRESETS = entry.presets.map((p) => p.input as In);

/** Independent classification of a node range against the query. */
const relation = (nl: number, nr: number, ql: number, qr: number): number =>
  qr < nl || nr < ql ? 1 : ql <= nl && nr <= qr ? 0 : 2;

entryContract<In>({
  entry: entry as never,
  visualizer: 'tree',
  topics: ['t3-segment-tree'],
  maxFrames: 60,
  presets: ['n8-mid', 'n8-full', 'n4-point', 'n8-edge', 'n4-span'],
  beats: ['start', 'build', 'visit', 'full-cover', 'no-overlap', 'split', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: [
    'n',
    'last',
    'lv',
    'l',
    'r',
    'sum',
    'ql',
    'qr',
    'k',
    'nl',
    'nr',
    'acc',
    'mid',
    'k2',
    'k3',
    'parts',
  ],
  pointers: [],
  allow: [2],
  extra: ALL.filter((_, k) => k % 7 === 0),
  bad: [
    { values: [1, 2, 3], l: 0, r: 1 },
    { values: [1, 2, 3, 4, 5], l: 0, r: 1 },
    { values: [1, 2, 3, 4, 5, 6, 7], l: 0, r: 1 },
    { values: [1, 2, 3, 4], l: 3, r: 1 },
    { values: [1, 2, 3, 4], l: 0, r: 4 },
    { values: [100, 2, 3, 4], l: 0, r: 1 },
    { values: [1, 2, 3, 4], l: -1, r: 1 },
    { values: [1, 2, 3, 4], l: 0, r: 8 },
    { values: [1, 2, 3, 4], l: 0, r: 1, extra: 1 },
    { values: [1, 2, 3, 4], l: 0 },
  ],
  predict: {
    visit: {
      options: 3,
      expected: (_input, frames, idx) => {
        const v = frames[idx].meta.vars as { nl: number; nr: number; ql: number; qr: number };
        return relation(v.nl, v.nr, v.ql, v.qr);
      },
    },
  },
});

describe('segment-tree: result', () => {
  it('the query result equals the direct sum, for every range of 8- and 4-element arrays', () => {
    for (const input of ALL) {
      const last = gen(input).at(-1)!;
      expect(last.meta.vars?.acc, JSON.stringify(input)).toBe(direct(input));
    }
  });

  it('the built tree holds the sum of its range in every node (ids 1..15, children 2k and 2k + 1)', () => {
    for (const values of [A4, A8]) {
      const frames = gen({ values, l: 0, r: values.length - 1 });
      const built = frames.filter((f) => beatOf(f).includes('build')).at(-1)!;
      expect(built.state.nodes).toHaveLength(2 * values.length - 1);
      for (const node of built.state.nodes) {
        const [l, r] = node.label.slice(1, -1).split(',').map(Number);
        expect(node.note).toBe(String(direct({ values, l, r })));
        const k = Number(node.id);
        expect(node.parent).toBe(k > 1 ? String(Math.floor(k / 2)) : undefined);
      }
    }
  });

  it('build goes bottom-up: leaves have notes first, the root last', () => {
    const frames = gen(PRESETS[0]).filter((f) => beatOf(f).includes('build'));
    expect(frames.length).toBe(4); // leaves, then 3 higher levels
    const withNote = (f: Frame<S>) => f.state.nodes.filter((x) => x.note !== undefined).length;
    expect(frames.map(withNote)).toEqual([8, 12, 14, 15]);
  });

  it('full-cover nodes are exactly the canonical decomposition; they are disjoint and add up', () => {
    for (const input of ALL) {
      const frames = gen(input);
      const covers = frames
        .filter((f) => beatOf(f).includes('full-cover'))
        .map((f) => f.meta.vars as { nl: number; nr: number });
      const cells = covers
        .flatMap(({ nl, nr }) => Array.from({ length: nr - nl + 1 }, (_, k) => nl + k))
        .sort((a, b) => a - b);
      expect(cells, JSON.stringify(input)).toEqual(
        Array.from({ length: input.r - input.l + 1 }, (_, k) => input.l + k),
      );
      expect(covers.length).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(input.values.length)));
    }
  });

  it('presets: the whole array is one full-cover frame at the root; a point query descends to a leaf', () => {
    const full = beats(gen(PRESETS[1]));
    expect(full.filter((b) => b === 'full-cover')).toHaveLength(1);
    expect(full.filter((b) => b === 'split')).toHaveLength(0);
    const point = gen(PRESETS[2]).filter((f) => beatOf(f).includes('full-cover'));
    expect(point).toHaveLength(1);
    expect(point[0].meta.vars).toMatchObject({ nl: 1, nr: 1 });
  });

  it('node kinds: muted outside, result inside, compare for the split nodes', () => {
    const last = gen(PRESETS[0]).at(-1)!;
    const kinds = Object.entries(last.meta.highlights ?? {});
    expect(kinds.filter(([, k]) => k === 'compare').length).toBeGreaterThan(0);
    expect(kinds.filter(([, k]) => k === 'result').length).toBeGreaterThan(0);
    expect(kinds.filter(([, k]) => k === 'muted').length).toBeGreaterThan(0);
  });

  it('the visit frame (the question) does not announce inside/outside/overlap', () => {
    for (const f of gen(PRESETS[0], 'en-US'))
      if (beatOf(f).includes('visit'))
        expect(f.meta.explanation).not.toMatch(/stop|drop|take the stored/);
  });

  it('check() accepts only n in {4, 8} and l <= r < n', () => {
    const v = (x: unknown) => validateInput(entry as never, x).ok;
    expect(v({ values: A4, l: 0, r: 3 })).toBe(true);
    expect(v({ values: A8, l: 7, r: 7 })).toBe(true);
    expect(v({ values: [1, 2, 3, 4, 5], l: 0, r: 1 })).toBe(false);
  });

  it('frame counts stay within maxFrames', () => {
    for (const input of ALL) expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
    expect(beats(gen(PRESETS[0])).length).toBeGreaterThan(0);
  });
});
