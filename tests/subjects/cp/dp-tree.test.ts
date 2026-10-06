import { describe, expect, it } from 'vitest';
import { dpTreeEntry as entry } from '@/lib/subjects/cp/catalog/dp-tree';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { g: { n: number; edges: number[][] }; w: number[] };
type TreeNode = { id: string; label: string; parent?: string; note?: string };
type S = { nodes: TreeNode[] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);

/** Independent oracle: all 2^n vertex sets, the independent ones. */
function brute({ g, w }: In): number {
  let best = 0;
  for (let mask = 0; mask < 1 << g.n; mask++) {
    if (g.edges.some(([a, b]) => (mask >> a) & 1 && (mask >> b) & 1)) continue;
    let total = 0;
    for (let i = 0; i < g.n; i++) if ((mask >> i) & 1) total += w[i];
    best = Math.max(best, total);
  }
  return best;
}
function family(): In[] {
  const out: In[] = [];
  let x = 4711;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 150; t++) {
    const n = 1 + next(8);
    const edges: number[][] = [];
    for (let v = 1; v < n; v++) {
      const u = next(v);
      edges.push(next(2) ? [u, v] : [v, u]);
    }
    out.push({ g: { n, edges }, w: Array.from({ length: n }, () => 1 + next(20)) });
  }
  out.push({
    g: {
      n: 8,
      edges: [
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [0, 6],
        [0, 7],
      ],
    },
    w: [20, 1, 1, 1, 1, 1, 1, 1],
  });
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);
const noteOf = (f: Frame<S>, id: string): number[] | undefined => {
  const note = f.state.nodes.find((x) => x.id === id)!.note;
  return note === undefined ? undefined : (JSON.parse(note) as number[]);
};

entryContract<In>({
  entry: entry as never,
  visualizer: 'tree',
  topics: ['t4-dp-tree'],
  maxFrames: 50,
  presets: ['star', 'path', 'binary', 'single'],
  beats: ['start', 'dfs-down', 'leaf', 'combine', 'choose-root', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['n', 'u', 'wu', 's1', 'd0', 'd1', 'r0', 'r1', 'best', 'chosen'],
  pointers: [],
  allow: [0],
  extra: FAMILY.slice(0, 25),
  bad: [
    { g: { n: 0, edges: [] }, w: [] },
    { g: { n: 9, edges: [] }, w: Array.from({ length: 9 }, () => 1) },
    { g: { n: 3, edges: [[0, 1]] }, w: [1, 2, 3] }, // not a tree: a node is cut off
    {
      g: {
        n: 3,
        edges: [
          [0, 1],
          [1, 2],
          [0, 2],
        ],
      },
      w: [1, 2, 3],
    },
    {
      g: {
        n: 3,
        edges: [
          [0, 1],
          [0, 1],
        ],
      },
      w: [1, 2, 3],
    },
    {
      g: {
        n: 3,
        edges: [
          [0, 1],
          [1, 2],
        ],
      },
      w: [1, 2],
    },
    { g: { n: 2, edges: [[0, 1]] }, w: [1, 2, 3] },
    { g: { n: 2, edges: [[0, 1]] }, w: [0, 2] },
    { g: { n: 2, edges: [[0, 1]] }, w: [21, 2] },
    { g: { n: 2, edges: [[0, 1]] }, w: [1, 2], extra: 1 },
    { g: { n: 2, edges: [[0, 1]] } },
  ],
  predict: { combine: { options: 2, expected: () => 1 } },
});

describe('dp-tree: result', () => {
  it('the answer equals the 2^n brute force', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const last = gen(input).at(-1)!;
      expect(last.meta.vars?.best, JSON.stringify(input)).toBe(brute(input));
    }
  });

  it('the picked nodes form an independent set of the optimal weight', () => {
    for (const input of FAMILY) {
      const last = gen(input).at(-1)!;
      const picked = Object.entries(last.meta.highlights ?? {})
        .filter(([, h]) => h === 'result')
        .map(([id]) => id.charCodeAt(0) - 65);
      expect(picked.reduce((s, i) => s + input.w[i], 0)).toBe(brute(input));
      for (const [a, b] of input.g.edges)
        expect(picked.includes(a) && picked.includes(b)).toBe(false);
    }
  });

  it('every node gets [dp0, dp1] equal to the best weight with/without it in its subtree', () => {
    for (const input of FAMILY.slice(0, 60)) {
      const frames = gen(input);
      const last = [...frames].reverse().find((f) => beatOf(f).includes('choose-root'))!;
      // the subtree of node u: nodes whose chain of parents reaches u (root is A)
      const parentOf = new Map(last.state.nodes.map((x) => [x.id, x.parent]));
      const inSubtree = (v: string, u: string): boolean => {
        for (let cur: string | undefined = v; cur !== undefined; cur = parentOf.get(cur))
          if (cur === u) return true;
        return false;
      };
      for (const node of last.state.nodes) {
        const [d0, d1] = noteOf(last, node.id)!;
        const members =
          input.g.edges.length === 0
            ? [0]
            : last.state.nodes
                .map((_, i) => i)
                .filter((i) => inSubtree(String.fromCharCode(65 + i), node.id));
        const sub = (mustTake: boolean | null): number => {
          let best = -Infinity;
          for (let mask = 0; mask < 1 << members.length; mask++) {
            const set = members.filter((_, k) => (mask >> k) & 1);
            const root = node.id.charCodeAt(0) - 65;
            if (mustTake === true && !set.includes(root)) continue;
            if (mustTake === false && set.includes(root)) continue;
            if (input.g.edges.some(([a, b]) => set.includes(a) && set.includes(b))) continue;
            best = Math.max(
              best,
              set.reduce((s, i) => s + input.w[i], 0),
            );
          }
          return best;
        };
        expect([d0, d1], `${node.id} ${JSON.stringify(input)}`).toEqual([sub(false), sub(true)]);
      }
    }
  });

  it('the tree is rooted at node 0 (A); each node but A has a parent; labels show the weight', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const f = gen(input)[0];
      expect(f.state.nodes.filter((x) => x.parent === undefined).map((x) => x.id)).toEqual(['A']);
      f.state.nodes.forEach((x, i) => expect(x.label).toBe(`${x.id} (w=${input.w[i]})`));
    }
  });

  it('beat structure: leaves have a leaf frame, inner nodes a combine question; one root choice', () => {
    for (const input of FAMILY.slice(0, 60)) {
      const seq = beats(gen(input));
      const kids = new Set(input.g.edges.map(([a, b]) => Math.min(a, b)));
      expect(seq.filter((b) => b === 'dfs-down')).toHaveLength(input.g.n);
      expect(seq.filter((b) => b === 'choose-root')).toHaveLength(1);
      expect(
        seq.filter((b) => b === 'leaf').length + seq.filter((b) => b === 'combine').length,
      ).toBe(input.g.n);
      expect(kids.size === 0 || seq.includes('combine')).toBe(true);
    }
  });

  it('presets: the weights of the four cards', () => {
    expect(PRESETS.map((p) => brute(p))).toEqual([17, 17, 25, 7]);
    expect(PRESETS.map((p) => gen(p).at(-1)!.meta.vars!.best)).toEqual([17, 17, 25, 7]);
  });

  it('check() reports not-a-tree and weights-length', () => {
    const issues = (x: unknown) => {
      const r = validateInput(entry as never, x);
      return r.ok ? [] : r.issues;
    };
    expect(issues({ g: { n: 3, edges: [[0, 1]] }, w: [1, 2, 3] }).join()).toContain('not-a-tree');
    expect(issues({ g: { n: 2, edges: [[0, 1]] }, w: [1] }).join()).toContain('weights-length');
    expect(issues({ g: { n: 2, edges: [[0, 1]] }, w: [1, 2] })).toEqual([]);
  });

  it('the combine frame (the question) has no [dp0, dp1] yet for the node it is about', () => {
    for (const input of FAMILY.slice(0, 40)) {
      for (const f of gen(input)) {
        if (!beatOf(f).includes('combine')) continue;
        const u = (f.meta.vars as { u: string }).u;
        expect(noteOf(f, u)).toBeUndefined();
      }
    }
  });

  it('frame counts stay within maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
