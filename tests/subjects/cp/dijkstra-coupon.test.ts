import { describe, expect, it } from 'vitest';
import { dijkstraCouponEntry as entry } from '@/lib/subjects/cp/catalog/dijkstra-coupon';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { n: number; edges: number[][] };
type S = {
  nodes: { id: string; label: string; x: number; y: number }[];
  edges: { from: string; to: string; weight: number; directed?: boolean; label?: string }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);

/** Independent oracle: every edge made free in turn (Bellman-Ford), plus the plain graph. */
function oracle({ n, edges }: In): number {
  const INF = 1e9;
  const bellman = (es: number[][]): number => {
    const d = Array<number>(n).fill(INF);
    d[0] = 0;
    for (let round = 0; round < n; round++)
      for (const [a, b, w] of es) {
        if (d[a] + w < d[b]) d[b] = d[a] + w;
        if (d[b] + w < d[a]) d[a] = d[b] + w;
      }
    return d[n - 1];
  };
  let best = bellman(edges);
  edges.forEach((_, i) => {
    best = Math.min(best, bellman(edges.map(([a, b, w], k) => (k === i ? [a, b, 0] : [a, b, w]))));
  });
  return best >= INF ? -1 : best;
}
function family(): In[] {
  const out: In[] = [];
  let x = 2024;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 150; t++) {
    const n = 2 + next(5);
    const all: number[][] = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) all.push([a, b]);
    const want = Math.min(all.length, 1 + next(8));
    const edges: number[][] = [];
    while (edges.length < want) {
      const [a, b] = all.splice(next(all.length), 1)[0];
      edges.push([a, b, 1 + next(20)]);
    }
    out.push({ n, edges });
  }
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);
const finalDist = (f: Frame<S>, v: number, k: number): number | undefined => {
  const label = f.state.nodes.find((x) => x.id === `${String.fromCharCode(65 + v)}${k}`)!.label;
  const mm = /\((\d+)\)/.exec(label);
  return mm ? Number(mm[1]) : undefined;
};

entryContract<In>({
  entry: entry as never,
  visualizer: 'graph',
  topics: ['t4-shortest-path'],
  maxFrames: 120,
  presets: ['classic', 'free-last', 'no-gain', 'unreachable'],
  beats: ['start', 'states', 'pop', 'relax-normal', 'relax-free', 'done'],
  required: ['start', 'done'],
  pseudoLines: 7,
  vars: ['a0', 'tn', 'd', 's', 'cur', 't', 'w', 'nd', 'old', 'u', 'imp', 'c0', 'c1', 'best'],
  pointers: [],
  allow: [0, 1],
  subtasks: 3,
  extra: FAMILY.slice(0, 20),
  bad: [
    { n: 1, edges: [[0, 0, 1]] },
    { n: 7, edges: [[0, 1, 1]] },
    { n: 3, edges: [] },
    { n: 3, edges: [[0, 1]] },
    { n: 3, edges: [[0, 1, 0]] },
    { n: 3, edges: [[0, 1, 21]] },
    {
      n: 3,
      edges: [
        [0, 1, 1],
        [1, 0, 2],
      ],
    },
    { n: 3, edges: Array.from({ length: 9 }, () => [0, 1, 1]) },
    { n: 3, edges: [[0, 1, 1]], extra: 1 },
    { n: 3 },
  ],
  predict: {
    'relax-free': {
      options: 2,
      expected: (_input, frames, idx) => {
        const f = frames[idx] as Frame<S>;
        const { d } = f.meta.vars as { d: number };
        // the layer-1 state the ticket would reach is the highlighted `compare` node ending in 1
        const target = Object.entries(f.meta.highlights ?? {}).find(
          ([id, h]) => h === 'compare' && id.endsWith('1'),
        )![0];
        const mm = /\((\d+)\)/.exec(f.state.nodes.find((x) => x.id === target)!.label);
        return mm === null || d < Number(mm[1]) ? 0 : 1;
      },
    },
  },
});

describe('dijkstra-coupon: result', () => {
  it('the final answer equals the "free each edge in turn" oracle (−1 when unreachable)', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const last = gen(input).at(-1)!;
      const want = oracle(input);
      const best = last.meta.vars?.best;
      expect(best === undefined ? -1 : best, JSON.stringify(input)).toBe(want);
    }
  });

  it('every settled layer-1 distance is the true "one ticket already used" optimum', () => {
    for (const input of FAMILY.slice(0, 60)) {
      const last = gen(input).at(-1)!;
      for (let v = 1; v < input.n; v++) {
        // dist[v][1] = min over free edges, which the oracle computes with node v as the target
        const target: In = { n: input.n, edges: input.edges };
        const INF = 1e9;
        const bell = (es: number[][]): number => {
          const d = Array<number>(input.n).fill(INF);
          d[0] = 0;
          for (let round = 0; round < input.n; round++)
            for (const [a, b, w] of es) {
              if (d[a] + w < d[b]) d[b] = d[a] + w;
              if (d[b] + w < d[a]) d[a] = d[b] + w;
            }
          return d[v];
        };
        let want = INF;
        target.edges.forEach((_, i) => {
          want = Math.min(
            want,
            bell(target.edges.map(([a, b, w], k) => (k === i ? [a, b, 0] : [a, b, w]))),
          );
        });
        const got = finalDist(last, v, 1);
        if (want >= INF) expect(got).toBeUndefined();
        else expect(got, `${JSON.stringify(input)} node ${v}`).toBe(want);
      }
    }
  });

  it('the state graph has two layers: 2n nodes, edges in both layers and weight-0 ticket arcs 0 → 1', () => {
    for (const input of FAMILY.slice(0, 30)) {
      const f = gen(input)[0];
      expect(f.state.nodes).toHaveLength(2 * input.n);
      expect(f.state.edges.filter((e) => e.directed)).toHaveLength(2 * input.edges.length);
      for (const e of f.state.edges.filter((x) => x.directed)) {
        expect(e.weight).toBe(0);
        expect(e.from.endsWith('0')).toBe(true);
        expect(e.to.endsWith('1')).toBe(true);
      }
      expect(f.state.edges.filter((e) => !e.directed)).toHaveLength(2 * input.edges.length);
    }
  });

  it('states are settled in non-decreasing cost order, each at most once', () => {
    for (const input of FAMILY.slice(0, 60)) {
      let prev = 0;
      const seen = new Set<string>();
      for (const f of gen(input)) {
        if (!beatOf(f).includes('pop') || !f.meta.explanation.match(/chốt|settled/)) continue;
        const { d, s } = f.meta.vars as { d: number; s: string };
        expect(d).toBeGreaterThanOrEqual(prev);
        prev = d;
        expect(seen.has(s)).toBe(false);
        seen.add(s);
      }
    }
  });

  it('presets: the card answers (a free last edge saves 10; one edge costs 0; unreachable gives -1)', () => {
    expect(PRESETS.map((p) => oracle(p))).toEqual([oracle(PRESETS[0]), 5, 0, -1]);
    expect(gen(PRESETS[1]).at(-1)!.meta.vars).toMatchObject({ best: 5, c0: 15, c1: 5 });
    expect(gen(PRESETS[2]).at(-1)!.meta.vars).toMatchObject({ best: 0, c0: 7, c1: 0 });
    expect(gen(PRESETS[3]).at(-1)!.meta.explanation).toMatch(/Không có đường/);
  });

  it('the free-edge question appears for the first two ticket relaxations only; result frames carry imp', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const frames = gen(input);
      expect(beats(frames).filter((b) => b === 'relax-free').length).toBeLessThanOrEqual(2);
      for (const f of frames) {
        const v = f.meta.vars as { imp?: number };
        if (v.imp !== undefined) expect([0, 1]).toContain(v.imp);
      }
    }
  });

  it('ticket arcs are labelled with the replaced weight', () => {
    const f = gen(PRESETS[1], 'en-US')[0];
    expect(f.state.edges.filter((e) => e.directed).map((e) => e.label)).toEqual([
      'ticket (2)',
      'ticket (2)',
      'ticket (3)',
      'ticket (3)',
      'ticket (10)',
      'ticket (10)',
    ]);
  });

  it('every input fits maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
