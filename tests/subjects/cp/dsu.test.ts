import { describe, expect, it } from 'vitest';
import { dsuEntry as entry } from '@/lib/subjects/cp/catalog/dsu';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { n: number; edges: number[][] };
type TreeNode = { id: string; label: string; parent?: string; note?: string };
type S = { nodes: TreeNode[] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);

/** Independent oracle: connected components by BFS over the unioned pairs. */
function components(n: number, edges: number[][]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const seen = Array<boolean>(n).fill(false);
  const out: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const comp = [s];
    seen[s] = true;
    for (let q = 0; q < comp.length; q++)
      for (const v of adj[comp[q]])
        if (!seen[v]) {
          seen[v] = true;
          comp.push(v);
        }
    out.push(comp.sort((x, y) => x - y));
  }
  return out;
}
const rootOf = (nodes: TreeNode[], x: number): number => {
  let cur = nodes[x];
  while (cur.parent !== undefined) cur = nodes[Number(cur.parent)];
  return Number(cur.id);
};
function family(): In[] {
  const out: In[] = [];
  let x = 1357;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 150; t++) {
    const n = 2 + next(7);
    const edges: number[][] = [];
    const k = 1 + next(8);
    while (edges.length < k) {
      const a = next(n);
      const b = next(n);
      if (a !== b) edges.push([a, b]);
    }
    out.push({ n, edges });
  }
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'tree',
  topics: ['t3-dsu'],
  maxFrames: 60,
  presets: ['chain', 'star', 'redundant', 'two-sets', 'min'],
  beats: ['start', 'find', 'compress', 'union', 'same-set', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: ['n', 'k', 'a', 'b', 'x', 'ra', 'rb', 'r', 'sa', 'sb', 's', 'sets'],
  pointers: [],
  allow: [1],
  extra: FAMILY.slice(0, 25),
  bad: [
    { n: 1, edges: [[0, 0]] },
    { n: 9, edges: [[0, 1]] },
    { n: 3, edges: [] },
    { n: 3, edges: Array.from({ length: 9 }, () => [0, 1]) },
    { n: 3, edges: [[1, 1]] },
    { n: 3, edges: [[0, 3]] },
    { n: 3, edges: [[0, 1, 4]] },
    { n: 3, edges: [[0, 1]], extra: 1 },
    { n: 3 },
  ],
  predict: {
    find: {
      options: 3,
      expected: (input, frames, idx) => {
        const f = frames[idx] as Frame<S>;
        const x = (f.meta.vars as { x: number }).x;
        const nodes = f.state.nodes;
        let depth = 0;
        for (let cur = nodes[x]; cur.parent !== undefined; cur = nodes[Number(cur.parent)]) depth++;
        return Math.min(depth, 2);
      },
    },
  },
});

describe('dsu: result', () => {
  it('the final forest has exactly the connected components of the BFS oracle', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const last = gen(input).at(-1)!;
      const comps = components(input.n, input.edges);
      expect(last.meta.vars?.sets, JSON.stringify(input)).toBe(comps.length);
      for (const comp of comps) {
        const roots = new Set(comp.map((x) => rootOf(last.state.nodes, x)));
        expect(roots.size).toBe(1);
        const root = [...roots][0];
        expect(last.state.nodes[root].note).toBe(`|S|=${comp.length}`);
      }
    }
  });

  it('only roots carry a size note; non-roots carry a parent; exactly one of the two', () => {
    for (const input of FAMILY.slice(0, 60)) {
      for (const f of gen(input)) {
        for (const x of f.state.nodes)
          expect((x.parent === undefined) !== (x.note === undefined)).toBe(true);
      }
    }
  });

  it('union by size: the new root is the larger set, ties keep the root of a; sizes add up', () => {
    for (const input of FAMILY.slice(0, 60)) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('union')) return;
        const { ra, rb, sa, sb, s } = f.meta.vars as Record<string, number>;
        expect(s).toBe(sa + sb);
        const keep = sa >= sb ? ra : rb;
        const gone = sa >= sb ? rb : ra;
        expect(f.state.nodes[gone].parent).toBe(String(keep));
        expect(f.state.nodes[keep].note).toBe(`|S|=${s}`);
        expect(frames[k - 1]).toBeDefined();
      });
    }
  });

  it('a compress frame leaves every node of the path one step below the root', () => {
    for (const input of FAMILY) {
      for (const f of gen(input)) {
        if (!beatOf(f).includes('compress')) continue;
        const { x, r } = f.meta.vars as { x: number; r: number };
        expect(f.state.nodes[x].parent).toBe(String(r));
        expect(f.state.nodes[r].parent).toBeUndefined();
      }
    }
    // union by size keeps trees low: two-sets reaches depth 2 (3 -> 2 -> 0) and the next find compresses it
    expect(beats(gen(PRESETS[3]))).toContain('compress');
  });

  it('same-set exactly when both roots are equal; every other union merges', () => {
    for (const input of FAMILY) {
      const seq = beats(gen(input));
      const merges = seq.filter((b) => b === 'union').length;
      const same = seq.filter((b) => b === 'same-set').length;
      expect(merges + same).toBe(input.edges.length);
      expect(merges).toBe(input.n - components(input.n, input.edges).length);
    }
    expect(beats(gen(PRESETS[2]))).toContain('same-set');
  });

  it('each set has its own group kind: nodes of one set share it', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const last = gen(input).at(-1)!;
      for (const comp of components(input.n, input.edges)) {
        const kinds = new Set(comp.map((x) => last.meta.highlights![String(x)]));
        expect(kinds.size).toBe(1);
        expect([...kinds][0]).toMatch(/^group-[0-5]$/);
      }
    }
  });

  it('the find frame (the question) does not reveal the root', () => {
    for (const input of FAMILY.slice(0, 40)) {
      for (const f of gen(input, 'en-US')) {
        if (beatOf(f).includes('find') && f.meta.explanation.includes('step 1'))
          expect(f.meta.explanation).not.toMatch(/root of .* is/);
      }
    }
  });

  it('frame counts: all inputs within maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
