import { describe, expect, it } from 'vitest';
import { dfsEntry as entry } from '@/lib/subjects/cp/catalog/dfs';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { g: { n: number; edges: number[][] }; source: number };
type S = { nodes: { id: string; label: string }[]; edges: { from: string; to: string }[] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const L = (i: number): string => String.fromCharCode(65 + i);

/** Independent oracle 1: the reachable set by transitive closure. */
function reachable(g: In['g'], source: number): Set<number> {
  const reach = new Set([source]);
  for (let round = 0; round < g.n; round++)
    for (const [a, b] of g.edges) {
      if (reach.has(a)) reach.add(b);
      if (reach.has(b)) reach.add(a);
    }
  return reach;
}
/** Independent oracle 2: iterative DFS, neighbours pushed in reverse, visited marked at pop. */
function preorder(g: In['g'], source: number): number[] {
  const adj: number[][] = Array.from({ length: g.n }, () => []);
  for (const [a, b] of g.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  adj.forEach((x) => x.sort((p, q) => p - q));
  const seen = new Set<number>();
  const out: number[] = [];
  const st = [source];
  while (st.length) {
    const u = st.pop()!;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    for (const v of [...adj[u]].reverse()) if (!seen.has(v)) st.push(v);
  }
  return out;
}
function family(): In[] {
  const out: In[] = [];
  let x = 777;
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
const orderOf = (f: Frame<S>, n: number): number[] =>
  Array.from({ length: n }, (_, i) => {
    const m = /#(\d+)/.exec(f.state.nodes[i].label);
    return m ? Number(m[1]) : 0;
  });

entryContract<In>({
  entry: entry as never,
  visualizer: 'graph',
  topics: ['t3-graph-traversal'],
  maxFrames: 50,
  presets: ['tree', 'cycle', 'disconnected', 'single', 'deep-chain'],
  beats: ['start', 'visit', 'tree-edge', 'skip-visited', 'backtrack', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['s', 'u', 'v', 'k', 'kv', 'size', 'count', 'n', 'tree'],
  pointers: [],
  allow: [1],
  extra: FAMILY.slice(0, 25),
  bad: [
    { g: { n: 0, edges: [] }, source: 0 },
    { g: { n: 3, edges: [[0, 1]] }, source: 5 },
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
    { g: { n: 3, edges: [[2, 2]] }, source: 0 },
    { g: { n: 9, edges: [] }, source: 0 },
    { g: { n: 3, edges: [] }, source: 0, extra: 1 },
    {},
  ],
  predict: {
    visit: {
      options: 3,
      expected: (input, frames, idx) => {
        const f = frames[idx] as Frame<S>;
        const u = (f.meta.vars as { u: string }).u.charCodeAt(0) - 65;
        const seen = new Set(
          f.state.nodes.map((x, i) => (/#\d+/.test(x.label) ? i : -1)).filter((i) => i >= 0),
        );
        const nbrs = input.g.edges
          .flatMap(([a, b]) => (a === u ? [b] : b === u ? [a] : []))
          .sort((p, q) => p - q);
        if (nbrs.length === 0) return 2;
        return seen.has(nbrs[0]) ? 1 : 0;
      },
    },
  },
});

describe('dfs: result', () => {
  it('the visited set equals the reachable set (closure) and the numbers are 1..count', () => {
    for (const input of [...FAMILY, ...PRESET_INPUTS]) {
      const last = gen(input).at(-1)!;
      const order = orderOf(last, input.g.n);
      const want = reachable(input.g, input.source);
      expect(new Set(order.flatMap((o, i) => (o > 0 ? [i] : []))), JSON.stringify(input)).toEqual(
        want,
      );
      expect(order.filter((o) => o > 0).sort((a, b) => a - b)).toEqual(
        Array.from({ length: want.size }, (_, k) => k + 1),
      );
    }
  });

  it('the visit order equals the iterative DFS preorder (neighbours pushed in reverse)', () => {
    for (const input of [...FAMILY, ...PRESET_INPUTS]) {
      const last = gen(input).at(-1)!;
      const order = orderOf(last, input.g.n);
      const byNumber = order.flatMap((o, i) => (o > 0 ? [[o, i]] : [])).sort((a, b) => a[0] - b[0]);
      expect(
        byNumber.map(([, i]) => i),
        JSON.stringify(input),
      ).toEqual(preorder(input.g, input.source));
    }
  });

  it('every new node is adjacent to the node on top of the call stack', () => {
    for (const input of FAMILY) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('tree-edge')) return;
        const { u, v } = f.meta.vars as { u: string; v: string };
        const stack = frames[k - 1].meta.aux![0].items;
        // the visit / skip frame before shows the stack with u on top
        expect(stack.at(-1)).toBe(u);
        const a = u.charCodeAt(0) - 65;
        const b = v.charCodeAt(0) - 65;
        expect(input.g.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))).toBe(
          true,
        );
      });
    }
  });

  it('visit, backtrack and stack depth balance: pushes = pops = visited count', () => {
    for (const input of FAMILY) {
      const seq = beats(gen(input));
      const count = reachable(input.g, input.source).size;
      expect(seq.filter((b) => b === 'visit')).toHaveLength(count);
      expect(seq.filter((b) => b === 'backtrack')).toHaveLength(count);
      expect(seq.filter((b) => b === 'tree-edge')).toHaveLength(count - 1);
      const last = gen(input).at(-2)!;
      expect(last.meta.aux![0].items).toEqual([]); // the source is popped last
    }
  });

  it('preset sequences', () => {
    expect(beats(gen(PRESET_INPUTS[3]))).toEqual(['start', 'visit', 'backtrack', 'done']);
    const chain = beats(gen(PRESET_INPUTS[4]));
    expect(chain.filter((b) => b === 'tree-edge')).toHaveLength(7);
    expect(chain.filter((b) => b === 'backtrack')).toHaveLength(8);
    expect(beats(gen(PRESET_INPUTS[1]))).toContain('skip-visited');
  });

  it('tree edges are marked result and never more than count - 1', () => {
    for (const input of FAMILY) {
      const last = gen(input).at(-1)!;
      const tree = Object.entries(last.meta.highlights ?? {}).filter(
        ([k, h]) => k.includes('-') && h === 'result',
      );
      expect(tree).toHaveLength((last.meta.vars!.count as number) - 1);
      expect(last.meta.vars!.tree).toBe(tree.length);
    }
  });

  it('unreached nodes keep their plain label and end muted', () => {
    const last = gen(PRESET_INPUTS[2]).at(-1)!;
    expect(last.state.nodes.map((x) => x.label)).toEqual([
      'A (#1)',
      'B (#2)',
      'C (#3)',
      'D',
      'E',
      'F',
    ]);
    expect(last.meta.highlights).toMatchObject({ D: 'muted', E: 'muted', F: 'muted' });
    expect(L(3)).toBe('D');
  });

  it('the visit frame (the question) does not announce the next step', () => {
    for (const p of PRESET_INPUTS) {
      for (const f of gen(p, 'en-US')) {
        if (beatOf(f).includes('visit'))
          expect(f.meta.explanation).not.toMatch(/tree edge|skip|backtrack and/);
      }
    }
  });

  it('every input fits maxFrames', () => {
    for (const input of FAMILY) expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
