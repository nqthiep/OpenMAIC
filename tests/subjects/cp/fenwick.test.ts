import { describe, expect, it } from 'vitest';
import { fenwickEntry as entry } from '@/lib/subjects/cp/catalog/fenwick';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { values: number[]; q: number };
type TreeNode = { id: string; label: string; parent?: string; note?: string };
type S = { nodes: TreeNode[] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const A8 = [5, 3, 8, 1, 9, 2, 7, 4];
const A4 = [6, -2, 4, 3];
const prefix = (values: readonly number[], q: number): number =>
  values.slice(0, q).reduce((s, x) => s + x, 0);
function* queries(): Generator<In> {
  for (const values of [A4, A8, [-99, 99, -99, 99, -99, 99, -99, 99]])
    for (let q = 1; q <= values.length; q++) yield { values, q };
}
const ALL = [...queries()];
const PRESETS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'tree',
  topics: ['t3-fenwick'],
  maxFrames: 50,
  presets: ['n8-q7', 'n8-q8', 'n4-q1', 'n8-q5'],
  beats: ['start', 'lowbit', 'build-add', 'query-jump', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['n', 'i', 'ni', 'ai', 'lb', 'j', 'tj', 'nj', 'q', 'jl', 'sum', 'steps'],
  pointers: [],
  allow: [2],
  extra: ALL,
  bad: [
    { values: [1, 2, 3], q: 1 },
    { values: [1, 2, 3, 4, 5], q: 1 },
    { values: [1, 2, 3, 4], q: 5 },
    { values: [1, 2, 3, 4], q: 0 },
    { values: [1, 2, 3, 4], q: 9 },
    { values: [100, 2, 3, 4], q: 1 },
    { values: [1, 2, 3, 4], q: 1.5 },
    { values: [1, 2, 3, 4], q: 1, extra: 1 },
    { values: [1, 2, 3, 4] },
  ],
  predict: {
    lowbit: {
      options: 4,
      expected: (_input, frames, idx) => {
        const i = (frames[idx].meta.vars as { i: number }).i;
        // independent: the largest power of two dividing i
        let p = 1;
        while (i % (p * 2) === 0) p *= 2;
        return Math.log2(p);
      },
    },
  },
});

describe('fenwick: result', () => {
  it('the prefix sum equals the direct sum, for every q on three arrays', () => {
    for (const input of ALL) {
      expect(gen(input).at(-1)!.meta.vars?.sum, JSON.stringify(input)).toBe(
        prefix(input.values, input.q),
      );
    }
  });

  it('after the build every node i holds the sum over (i - lowbit(i), i]', () => {
    for (const input of ALL.filter((x) => x.q === x.values.length)) {
      const frames = gen(input);
      const lastBuild = frames.filter((f) => beatOf(f).includes('build-add')).at(-1)!;
      for (const node of lastBuild.state.nodes) {
        const i = Number(node.id);
        const lb = i & -i;
        expect(node.note, `${JSON.stringify(input)} node ${i}`).toBe(
          String(prefix(input.values, i) - prefix(input.values, i - lb)),
        );
        expect(node.label).toBe(`${i}:(${i - lb},${i}]`);
      }
    }
  });

  it('parent of i is i + lowbit(i) when it is at most n; the structure is a forest with root n', () => {
    for (const n of [4, 8]) {
      const f = gen({ values: n === 4 ? A4 : A8, q: 1 })[0];
      f.state.nodes.forEach((node) => {
        const i = Number(node.id);
        const p = i + (i & -i);
        expect(node.parent).toBe(p <= n ? String(p) : undefined);
      });
      expect(f.state.nodes.filter((x) => x.parent === undefined).map((x) => x.id)).toEqual([
        String(n),
      ]);
    }
  });

  it('the update path of index i is i, i + lowbit(i), … and has at most log2(n) + 1 nodes', () => {
    for (const input of ALL.filter((x) => x.q === 1)) {
      const frames = gen(input);
      let i = 0;
      const path: number[] = [];
      const flush = () => {
        if (i === 0) return;
        let want: number[] = [];
        for (let j = i; j <= input.values.length; j += j & -j) want.push(j);
        expect(path, `${JSON.stringify(input)} i=${i}`).toEqual(want);
        expect(want.length).toBeLessThanOrEqual(Math.log2(input.values.length) + 1);
        want = [];
      };
      for (const f of frames) {
        const b = beatOf(f)[0];
        if (b === 'lowbit') {
          flush();
          i = (f.meta.vars as { i: number }).i;
          path.length = 0;
        }
        if (b === 'build-add') path.push((f.meta.vars as { j: number }).j);
      }
      flush();
    }
  });

  it('the query visits popcount(q) nodes, dropping the lowest bit each time', () => {
    for (const input of ALL) {
      const jumps = gen(input)
        .filter((f) => beatOf(f).includes('query-jump'))
        .map((f) => (f.meta.vars as { j: number }).j);
      const want: number[] = [];
      for (let j = input.q; j > 0; j -= j & -j) want.push(j);
      expect(jumps).toEqual(want);
      expect(jumps.length).toBe(input.q.toString(2).split('1').length - 1);
    }
    expect(beats(gen(PRESETS[0])).filter((b) => b === 'query-jump')).toHaveLength(3); // 7, 6, 4
    expect(beats(gen(PRESETS[1])).filter((b) => b === 'query-jump')).toHaveLength(1); // 8
  });

  it('the lowbit frame (the question) does not state the value', () => {
    for (const f of gen(PRESETS[0], 'en-US')) {
      if (beatOf(f).includes('lowbit')) expect(f.meta.explanation).not.toMatch(/is [1248]\b/);
    }
  });

  it('check() accepts n in {4, 8} and q <= n only', () => {
    const v = (x: unknown) => validateInput(entry as never, x).ok;
    expect(v({ values: A4, q: 4 })).toBe(true);
    expect(v({ values: A4, q: 5 })).toBe(false);
    expect(v({ values: [1, 2, 3, 4, 5], q: 2 })).toBe(false);
  });

  it('frame counts stay within maxFrames', () => {
    for (const input of ALL) expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
