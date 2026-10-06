import { describe, expect, it } from 'vitest';
import { dijkstraEntry as entry } from '@/lib/subjects/cp/catalog/dijkstra';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { g: { n: number; edges: number[][] }; source: number };
type S = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; weight: number }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);

/** Independent oracle: Bellman-Ford; -1 for unreachable. */
function bellman(g: In['g'], source: number): number[] {
  const INF = 1e9;
  const d = Array<number>(g.n).fill(INF);
  d[source] = 0;
  for (let round = 0; round < g.n; round++)
    for (const [a, b, w] of g.edges) {
      if (d[a] + w < d[b]) d[b] = d[a] + w;
      if (d[b] + w < d[a]) d[a] = d[b] + w;
    }
  return d.map((x) => (x >= INF ? -1 : x));
}
const distOf = (f: Frame<S>, n: number): number[] =>
  Array.from({ length: n }, (_, i) => {
    const m = /\((\d+)\)/.exec(f.state.nodes[i].label);
    return m ? Number(m[1]) : -1;
  });
function family(): In[] {
  const out: In[] = [];
  let x = 6060;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 150; t++) {
    const n = 1 + next(8);
    const all: number[][] = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) all.push([a, b]);
    const want = Math.min(all.length, next(15));
    const edges: number[][] = [];
    while (edges.length < want) {
      const [a, b] = all.splice(next(all.length), 1)[0];
      edges.push([a, b, 1 + next(20)]);
    }
    out.push({ g: { n, edges }, source: next(n) });
  }
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'graph',
  topics: ['t4-shortest-path'],
  maxFrames: 90,
  presets: ['classic', 'relax-twice', 'unreachable', 'single', 'line'],
  beats: ['start', 'pop', 'settle', 'relax', 'skip-stale', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: ['s', 'd', 'u', 'v', 'w', 'nd', 'old', 'cur', 'far'],
  pointers: [],
  allow: [0],
  extra: FAMILY.slice(0, 25),
  bad: [
    { g: { n: 0, edges: [] }, source: 0 },
    { g: { n: 9, edges: [] }, source: 0 },
    { g: { n: 3, edges: [[0, 1, 0]] }, source: 0 },
    { g: { n: 3, edges: [[0, 1, 21]] }, source: 0 },
    { g: { n: 3, edges: [[0, 1]] }, source: 0 },
    {
      g: {
        n: 3,
        edges: [
          [0, 1, 1],
          [1, 0, 2],
        ],
      },
      source: 0,
    },
    { g: { n: 3, edges: [] }, source: 3 },
    { g: { n: 3, edges: Array.from({ length: 15 }, () => [0, 1, 1]) }, source: 0 },
    { g: { n: 3, edges: [] }, source: 0, extra: 1 },
    { g: { n: 3, edges: [] } },
  ],
  predict: { pop: { options: 2, expected: () => 0 } },
});

describe('dijkstra: result', () => {
  it('the final distances equal Bellman-Ford (including unreachable nodes)', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const last = gen(input).at(-1)!;
      expect(distOf(last, input.g.n), JSON.stringify(input)).toEqual(
        bellman(input.g, input.source),
      );
    }
  });

  it('nodes are settled in non-decreasing distance order and each only once', () => {
    for (const input of FAMILY) {
      const frames = gen(input);
      let prev = 0;
      const seen = new Set<string>();
      for (const f of frames) {
        if (!beatOf(f).includes('settle')) continue;
        const { d, u } = f.meta.vars as { d: number; u: string };
        expect(d).toBeGreaterThanOrEqual(prev);
        prev = d;
        expect(seen.has(u)).toBe(false);
        seen.add(u);
      }
    }
  });

  it('every settled distance is already the final one (no later improvement)', () => {
    for (const input of FAMILY.slice(0, 80)) {
      const frames = gen(input);
      const want = bellman(input.g, input.source);
      for (const f of frames) {
        if (!beatOf(f).includes('settle')) continue;
        const { d, u } = f.meta.vars as { d: number; u: string };
        expect(d).toBe(want[u.charCodeAt(0) - 65]);
      }
    }
  });

  it('a relax frame strictly improves the distance, and the heap holds the new pair', () => {
    for (const input of FAMILY.slice(0, 80)) {
      const frames = gen(input);
      frames.forEach((f) => {
        if (!beatOf(f).includes('relax')) return;
        const { v, nd, old, w, d } = f.meta.vars as {
          v: string;
          nd: number;
          old: number | string;
          w: number;
          d: number;
        };
        expect(nd).toBe(d + w);
        if (old !== '∞') expect(nd).toBeLessThan(old as number);
        expect(f.meta.aux![0].items).toContain(`(${nd}, ${v})`);
      });
    }
  });

  it('relax-twice: one node is improved twice and its stale entry is skipped later', () => {
    const frames = gen(PRESETS[1]);
    const relaxed = frames
      .filter((f) => beatOf(f).includes('relax'))
      .map((f) => (f.meta.vars as { v: string }).v);
    expect(relaxed.filter((v) => v === 'C').length).toBe(1);
    expect(relaxed.filter((v) => v === 'B').length).toBe(2); // 10 first, then 7 through C
    expect(beats(frames)).toContain('skip-stale');
  });

  it('the pop question appears for the first two pops only', () => {
    for (const input of FAMILY.slice(0, 40)) {
      expect(beats(gen(input)).filter((b) => b === 'pop').length).toBeLessThanOrEqual(2);
    }
  });

  it('presets: unreachable stays unlabelled and muted; a single node is settled at 0', () => {
    const last = gen(PRESETS[2]).at(-1)!;
    expect(last.state.nodes.map((x) => x.label)).toEqual(['A (0)', 'B (4)', 'C (7)', 'D', 'E']);
    expect(last.meta.highlights).toMatchObject({ D: 'muted', E: 'muted' });
    expect(distOf(gen(PRESETS[3]).at(-1)!, 1)).toEqual([0]);
  });

  it('the pop frame (the question) hides which entry leaves the heap', () => {
    for (const f of gen(PRESETS[0], 'en-US')) {
      if (beatOf(f).includes('pop')) expect(f.meta.vars).not.toHaveProperty('u');
    }
  });

  it('every input fits maxFrames (90); the card’s 60 holds for the presets', () => {
    for (const p of PRESETS) expect(gen(p).length).toBeLessThanOrEqual(60);
    for (const input of FAMILY) expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
