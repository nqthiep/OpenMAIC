import { describe, expect, it } from 'vitest';
import { bfsEntry as entry } from '@/lib/subjects/cp/catalog/bfs';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { g: { n: number; edges: number[][] }; source: number };
type S = { nodes: { id: string; label: string }[]; edges: { from: string; to: string }[] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const L = (i: number): string => String.fromCharCode(65 + i);

/** Independent oracle: Bellman-Ford with unit weights. */
function oracle(g: In['g'], source: number): number[] {
  const INF = 1e9;
  const d = Array<number>(g.n).fill(INF);
  d[source] = 0;
  for (let round = 0; round < g.n; round++)
    for (const [a, b] of g.edges) {
      if (d[a] + 1 < d[b]) d[b] = d[a] + 1;
      if (d[b] + 1 < d[a]) d[a] = d[b] + 1;
    }
  return d.map((x) => (x >= INF ? -1 : x));
}
/** Deterministic graph family from a linear congruential generator: up to 8 nodes, 12 edges. */
function family(): In[] {
  const out: In[] = [];
  let x = 4242;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 150; t++) {
    const n = 1 + next(8);
    const all: number[][] = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) all.push([a, b]);
    const edges: number[][] = [];
    const want = Math.min(all.length, next(13));
    while (edges.length < want) edges.push(...all.splice(next(all.length), 1));
    out.push({ g: { n, edges }, source: next(n) });
  }
  // the densest case: 8 nodes, 12 edges
  out.push({
    g: {
      n: 8,
      edges: [
        [0, 1],
        [0, 2],
        [0, 3],
        [1, 2],
        [1, 4],
        [2, 5],
        [3, 4],
        [3, 6],
        [4, 7],
        [5, 6],
        [5, 7],
        [6, 7],
      ],
    },
    source: 0,
  });
  return out;
}
const FAMILY = family();
const PRESET_INPUTS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'graph',
  topics: ['t3-graph-traversal'],
  maxFrames: 70,
  presets: ['tree', 'cycle', 'disconnected', 'single', 'two-paths'],
  beats: ['start', 'dequeue', 'enqueue', 'skip-visited', 'layer', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: ['s', 'u', 'v', 'du', 'dv', 'pd', 'count', 'n', 'far'],
  pointers: [],
  allow: [1],
  extra: FAMILY.slice(0, 25),
  bad: [
    { g: { n: 0, edges: [] }, source: 0 },
    { g: { n: 9, edges: [] }, source: 0 },
    { g: { n: 3, edges: [[0, 1]] }, source: 3 },
    {
      g: {
        n: 3,
        edges: [
          [0, 1],
          [1, 0],
        ],
      },
      source: 0,
    },
    {
      g: {
        n: 3,
        edges: [
          [0, 1],
          [0, 1],
        ],
      },
      source: 0,
    },
    { g: { n: 3, edges: [[1, 1]] }, source: 0 },
    { g: { n: 3, edges: [[0, 3]] }, source: 0 },
    { g: { n: 3, edges: [[0, 1, 5]] }, source: 0 },
    { g: { n: 3, edges: Array.from({ length: 13 }, () => [0, 1]) }, source: 0 },
    { g: { n: 3, edges: [] }, source: 8 },
    { g: { n: 3, edges: [] }, source: 0, extra: 1 },
    { g: { n: 3, edges: [] } },
  ],
  predict: {
    enqueue: {
      options: 2,
      expected: (_input, frames, idx) => {
        const f = frames[idx] as Frame<S>;
        const v = (f.meta.vars as { v: string }).v;
        const node = f.state.nodes.find((x) => x.id === v)!;
        return node.label.includes('(d=') ? 1 : 0;
      },
    },
  },
});

const distOf = (f: Frame<S>, n: number): number[] =>
  Array.from({ length: n }, (_, i) => {
    const m = /\(d=(\d+)\)/.exec(f.state.nodes[i].label);
    return m ? Number(m[1]) : -1;
  });

describe('bfs: result', () => {
  it('the final distances equal the Bellman-Ford oracle', () => {
    for (const input of [...FAMILY, ...PRESET_INPUTS]) {
      const last = gen(input).at(-1)!;
      expect(distOf(last, input.g.n), JSON.stringify(input)).toEqual(oracle(input.g, input.source));
      expect(last.meta.vars?.count).toBe(
        oracle(input.g, input.source).filter((d) => d >= 0).length,
      );
    }
  });

  it('check rejects an out-of-range source and duplicate edges, in both directions', () => {
    const v = (x: unknown) => validateInput(entry as never, x).ok;
    expect(v({ g: { n: 3, edges: [[0, 1]] }, source: 2 })).toBe(true);
    expect(v({ g: { n: 3, edges: [[0, 1]] }, source: 3 })).toBe(false);
    expect(
      v({
        g: {
          n: 3,
          edges: [
            [0, 1],
            [1, 0],
          ],
        },
        source: 0,
      }),
    ).toBe(false);
  });

  it('nodes leave the queue in distance order, and a layer frame marks each distance increase', () => {
    for (const input of FAMILY) {
      const frames = gen(input);
      let prev = 0;
      for (const f of frames) {
        const b = beatOf(f)[0];
        if (b !== 'dequeue' && b !== 'layer') continue;
        const du = (f.meta.vars as { du: number }).du;
        expect(du, JSON.stringify(input)).toBeGreaterThanOrEqual(prev);
        expect(b === 'layer', JSON.stringify(input)).toBe(du > prev);
        prev = du;
      }
    }
  });

  it('a neighbour is queued exactly when it was unvisited (marked at enqueue time)', () => {
    for (const input of FAMILY) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('enqueue')) return;
        const next = frames[k + 1];
        const v = Number((f.meta.vars as { v: string }).v.charCodeAt(0) - 65);
        const was = distOf(f, input.g.n)[v];
        if (was === -1) {
          expect(beatOf(next)).toEqual([]);
          expect(distOf(next, input.g.n)[v]).toBe((next.meta.vars as { dv: number }).dv);
          expect(next.meta.aux![0].items.at(-1)).toBe(L(v));
        } else {
          expect(beatOf(next)).toEqual(['skip-visited']);
          expect((next.meta.vars as { dv: number }).dv).toBe(was);
        }
      });
    }
  });

  it('neighbours are scanned by increasing index', () => {
    for (const input of FAMILY.slice(0, 60)) {
      const frames = gen(input);
      let lastU = '';
      let lastV = '';
      for (const f of frames) {
        const b = beatOf(f)[0];
        if (b === 'dequeue' || b === 'layer') {
          lastU = '';
          lastV = '';
        }
        if (b === 'enqueue') {
          const { u, v } = f.meta.vars as { u: string; v: string };
          if (u === lastU) expect(v > lastV).toBe(true);
          lastU = u;
          lastV = v;
        }
      }
    }
  });

  it('each tree edge connects a node to its discoverer: the tree has count - 1 edges', () => {
    for (const input of FAMILY) {
      const last = gen(input).at(-1)!;
      const tree = Object.entries(last.meta.highlights ?? {}).filter(
        ([k, h]) => k.includes('-') && h === 'result',
      );
      expect(tree).toHaveLength((last.meta.vars!.count as number) - 1);
    }
  });

  it('presets: beat sequences', () => {
    expect(beats(gen(PRESET_INPUTS[3]))).toEqual(['start', 'dequeue', 'done']);
    const two = beats(gen(PRESET_INPUTS[4]));
    expect(two).toContain('skip-visited');
    expect(two).toContain('layer');
    // the disconnected graph never reaches nodes D, E, F: they stay unlabelled and end muted
    const last = gen(PRESET_INPUTS[2]).at(-1)!;
    expect(last.state.nodes.map((x) => x.label)).toEqual([
      'A (d=0)',
      'B (d=1)',
      'C (d=2)',
      'D',
      'E',
      'F',
    ]);
    expect(last.meta.highlights).toMatchObject({ D: 'muted', E: 'muted', F: 'muted' });
  });

  it('the enqueue frame (the question) shows no distance for an unvisited neighbour', () => {
    for (const p of PRESET_INPUTS) {
      for (const f of gen(p, 'en-US')) {
        if (beatOf(f).includes('enqueue'))
          expect(f.meta.explanation).not.toMatch(/unvisited|already|mark/);
      }
    }
  });

  it('frame counts: presets within the card’s 50, every input within maxFrames', () => {
    for (const p of PRESET_INPUTS) expect(gen(p).length).toBeLessThanOrEqual(50);
    let worst = 0;
    for (const input of FAMILY) worst = Math.max(worst, gen(input).length);
    expect(worst).toBeLessThanOrEqual(entry.maxFrames);
  });
});
