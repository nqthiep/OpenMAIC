import { describe, expect, it } from 'vitest';
import { kruskalEntry as entry } from '@/lib/subjects/cp/catalog/kruskal';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { n: number; edges: number[][] };
type S = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; weight: number }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const L = (i: number): string => String.fromCharCode(65 + i);
const key = (a: number, b: number): string => `${L(Math.min(a, b))}-${L(Math.max(a, b))}`;

/** Independent oracle: Prim on each component, returning the total weight and the component count. */
function prim(n: number, edges: number[][]): { total: number; comps: number } {
  const seen = Array<boolean>(n).fill(false);
  let total = 0;
  let comps = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    comps++;
    seen[s] = true;
    for (;;) {
      let best: number[] | null = null;
      for (const [u, v, w] of edges)
        if (seen[u] !== seen[v] && (best === null || w < best[2])) best = [u, v, w];
      if (!best) break;
      seen[best[0]] = true;
      seen[best[1]] = true;
      total += best[2];
    }
  }
  return { total, comps };
}
function family(): In[] {
  const out: In[] = [];
  let x = 5150;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 150; t++) {
    const n = 2 + next(7);
    const all: number[][] = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) all.push([a, b]);
    const want = Math.min(all.length, 1 + next(10));
    const edges: number[][] = [];
    while (edges.length < want) {
      const [a, b] = all.splice(next(all.length), 1)[0];
      edges.push(next(2) ? [a, b, 1 + next(5)] : [b, a, 1 + next(20)]);
    }
    out.push({ n, edges });
  }
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'graph',
  topics: ['t4-mst'],
  maxFrames: 40,
  presets: ['classic', 'ties', 'forest', 'already-tree', 'min'],
  beats: ['start', 'sort', 'consider', 'take', 'reject', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: ['n', 'm', 'u', 'v', 'w', 'ru', 'rv', 'total', 'taken', 'comps'],
  pointers: [],
  allow: [1],
  extra: FAMILY.slice(0, 25),
  bad: [
    { n: 1, edges: [[0, 0, 1]] },
    { n: 9, edges: [[0, 1, 1]] },
    { n: 3, edges: [] },
    { n: 3, edges: [[0, 1]] },
    { n: 3, edges: [[0, 1, 0]] },
    { n: 3, edges: [[0, 1, 21]] },
    { n: 3, edges: [[1, 1, 5]] },
    {
      n: 3,
      edges: [
        [0, 1, 5],
        [1, 0, 6],
      ],
    },
    {
      n: 3,
      edges: [
        [0, 1, 5],
        [0, 1, 5],
      ],
    },
    { n: 3, edges: [[0, 3, 5]] },
    { n: 3, edges: Array.from({ length: 11 }, () => [0, 1, 1]) },
    { n: 3, edges: [[0, 1, 5]], extra: 1 },
  ],
  predict: {
    consider: {
      options: 2,
      expected: (_input, frames, idx) => {
        const f = frames[idx] as Frame<S>;
        const { u, v } = f.meta.vars as { u: string; v: string };
        // independent: are u and v already joined by the highlighted (taken) edges?
        const taken = Object.entries(f.meta.highlights ?? {})
          .filter(([k, h]) => k.includes('-') && h === 'result')
          .map(([k]) => k.split('-'));
        const adj = new Map<string, string[]>();
        for (const [a, b] of taken) {
          adj.set(a, [...(adj.get(a) ?? []), b]);
          adj.set(b, [...(adj.get(b) ?? []), a]);
        }
        const seen = new Set([u]);
        for (const x of seen) for (const y of adj.get(x) ?? []) seen.add(y);
        return seen.has(v) ? 0 : 1;
      },
    },
  },
});

describe('kruskal: result', () => {
  it('the total weight and the component count equal Prim on every component', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const last = gen(input).at(-1)!;
      const want = prim(input.n, input.edges);
      expect(last.meta.vars?.total, JSON.stringify(input)).toBe(want.total);
      expect(last.meta.vars?.comps).toBe(want.comps);
      expect(last.meta.vars?.taken).toBe(input.n - want.comps);
    }
  });

  it('the chosen edges form a forest (no cycle) with taken = n - comps edges', () => {
    for (const input of FAMILY) {
      const last = gen(input).at(-1)!;
      const taken = Object.entries(last.meta.highlights ?? {}).filter(
        ([k, h]) => k.includes('-') && h === 'result',
      );
      expect(taken).toHaveLength(last.meta.vars!.taken as number);
      const parent = Array.from({ length: input.n }, (_, i) => i);
      const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
      for (const [k] of taken) {
        const [a, b] = k.split('-').map((c) => c.charCodeAt(0) - 65);
        expect(find(a)).not.toBe(find(b));
        parent[find(a)] = find(b);
      }
    }
  });

  it('edges are considered in non-decreasing weight order', () => {
    for (const input of FAMILY) {
      let prev = 0;
      for (const f of gen(input)) {
        if (!beatOf(f).includes('consider')) continue;
        const { w } = f.meta.vars as { w: number };
        expect(w).toBeGreaterThanOrEqual(prev);
        prev = w;
      }
    }
  });

  it('an edge is rejected exactly when both ends already share a root; the DSU row shows it', () => {
    for (const input of FAMILY.slice(0, 60)) {
      const frames = gen(input);
      frames.forEach((f) => {
        if (!beatOf(f).includes('reject')) return;
        const { u, v } = f.meta.vars as { u: string; v: string };
        expect(f.meta.highlights?.[key(u.charCodeAt(0) - 65, v.charCodeAt(0) - 65)]).toBe('muted');
      });
    }
  });

  it('stops early at n - 1 edges: classic considers fewer than its 9 edges; forest considers all', () => {
    const classic = beats(gen(PRESETS[0])).filter((b) => b === 'consider').length;
    expect(classic).toBeLessThan(9);
    expect(gen(PRESETS[0]).at(-1)!.meta.explanation).toMatch(/dừng sớm/);
    expect(beats(gen(PRESETS[2])).filter((b) => b === 'consider')).toHaveLength(4);
    expect(gen(PRESETS[2]).at(-1)!.meta.vars).toMatchObject({ comps: 3, taken: 3 });
  });

  it('presets: totals', () => {
    expect(PRESETS.map((p) => gen(p).at(-1)!.meta.vars!.total)).toEqual([
      prim(6, PRESETS[0].edges).total,
      6,
      8,
      16,
      5,
    ]);
  });

  it('the sort frame lists all edges in order; consider hides the verdict', () => {
    const frames = gen(PRESETS[0]);
    const sort = frames.find((f) => beatOf(f).includes('sort'))!;
    expect(sort.meta.aux!.find((a) => a.id === 'order')!.items).toHaveLength(9);
    for (const f of gen(PRESETS[0], 'en-US'))
      if (beatOf(f).includes('consider'))
        expect(f.meta.explanation).not.toMatch(/different sets|cycle and/);
  });

  it('frame counts stay within maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
