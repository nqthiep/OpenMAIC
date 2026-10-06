import { describe, expect, it } from 'vitest';
import { tarjanEntry as entry } from '@/lib/subjects/cp/catalog/tarjan';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';
import harness from './impl/tarjan';

type In = { n: number; edges: number[][] };
type S = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; directed: boolean }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
/** Independent oracle: mutual reachability classes (Floyd-Warshall closure). */
function classes({ n, edges }: In): number[][] {
  const reach = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j));
  for (const [a, b] of edges) reach[a][b] = true;
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) if (reach[i][k] && reach[k][j]) reach[i][j] = true;
  const seen = Array<boolean>(n).fill(false);
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const c = Array.from({ length: n }, (_, j) => j).filter((j) => reach[i][j] && reach[j][i]);
    c.forEach((j) => (seen[j] = true));
    out.push(c);
  }
  return out;
}
function family(): In[] {
  const out: In[] = [];
  let x = 9876;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 200; t++) {
    const n = 1 + next(8);
    const all: number[][] = [];
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) all.push([a, b]);
    const want = Math.min(all.length, next(15));
    const edges: number[][] = [];
    while (edges.length < want) edges.push(...all.splice(next(all.length), 1));
    out.push({ n, edges });
  }
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'graph',
  topics: ['t3-scc-bridges'],
  maxFrames: 60,
  presets: ['two-scc', 'dag', 'one-cycle', 'single'],
  beats: ['start', 'visit', 'back-edge', 'tree-return', 'pop-scc', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['n', 'u', 'd', 'v', 'dv', 'lu', 'nl', 'lv', 'comp', 'k'],
  pointers: [],
  allow: [0],
  extra: FAMILY.slice(0, 25),
  bad: [
    { n: 0, edges: [] },
    { n: 9, edges: [] },
    { n: 3, edges: [[1, 1]] },
    { n: 3, edges: [[0, 3]] },
    { n: 3, edges: [[0, 1, 2]] },
    { n: 3, edges: Array.from({ length: 15 }, () => [0, 1]) },
    { n: 3, edges: [], extra: 1 },
    { n: 3 },
  ],
  predict: { 'back-edge': { options: 3, expected: () => 1 } },
});

describe('tarjan: result', () => {
  it('the components equal the mutual-reachability classes (colour groups on the last frame)', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const last = gen(input).at(-1)!;
      const want = classes(input);
      expect(last.meta.vars?.k, JSON.stringify(input)).toBe(want.length);
      expect(String(last.meta.vars!.k)).toBe(harness.expected(input));
      for (const c of want) {
        const kinds = new Set(c.map((i) => last.meta.highlights![String.fromCharCode(65 + i)]));
        expect(kinds.size).toBe(1);
      }
    }
  });

  it('pop-scc frames list exactly the nodes of one class, with low = disc at the root', () => {
    for (const input of FAMILY.slice(0, 80)) {
      const want = classes(input).map((c) =>
        c
          .map((i) => String.fromCharCode(65 + i))
          .sort()
          .join(','),
      );
      const got = gen(input)
        .filter((f) => beatOf(f).includes('pop-scc'))
        .map((f) => String(f.meta.vars!.comp).slice(1, -1).split(', ').sort().join(','));
      expect(got.sort()).toEqual(want.sort());
    }
  });

  it('every label disc/low keeps low <= disc, and disc values are 1..n in visit order', () => {
    for (const input of FAMILY.slice(0, 60)) {
      const last = gen(input).at(-1)!;
      const discs = last.state.nodes
        .map((x) => Number(/\((\d+)\//.exec(x.label)![1]))
        .sort((a, b) => a - b);
      expect(discs).toEqual(Array.from({ length: input.n }, (_, i) => i + 1));
      for (const node of last.state.nodes) {
        const [d, l] = /\((\d+)\/(\d+)\)/.exec(node.label)!.slice(1).map(Number);
        expect(l).toBeLessThanOrEqual(d);
      }
    }
  });

  it('presets: 2 components, 5 (a DAG), 1, and 1', () => {
    expect(PRESETS.map((p) => gen(p).at(-1)!.meta.vars!.k)).toEqual([2, 5, 1, 1]);
  });

  it('the stack is empty at the end and holds only unassigned nodes in between', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const frames = gen(input);
      expect(frames.at(-1)!.meta.aux![0].items).toEqual([]);
    }
  });

  it('the back-edge question appears for the first two on-stack edges only', () => {
    for (const input of FAMILY.slice(0, 60))
      expect(
        gen(input)
          .flatMap(beatOf)
          .filter((b) => b === 'back-edge').length,
      ).toBeLessThanOrEqual(2);
  });

  it('every input fits maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
