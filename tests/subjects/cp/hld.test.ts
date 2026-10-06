import { describe, expect, it } from 'vitest';
import { hldEntry as entry } from '@/lib/subjects/cp/catalog/hld';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';
import harness from './impl/hld';

type In = { g: { n: number; edges: number[][] }; u: number; v: number };
type S = {
  nodes: { id: string; label: string; parent?: string; note?: string; edgeLabel?: string }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
function family(): In[] {
  const out: In[] = [];
  let x = 1010;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 150; t++) {
    const n = 2 + next(9);
    const edges: number[][] = [];
    for (let v = 1; v < n; v++) edges.push(next(2) ? [next(v), v] : [v, next(v)]);
    out.push({ g: { n, edges }, u: next(n), v: next(n) });
  }
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);
const lastSegs = (i: In): number => gen(i).at(-1)!.meta.vars!.segs as number;

entryContract<In>({
  entry: entry as never,
  visualizer: 'tree',
  topics: ['t4-tree-advanced'],
  maxFrames: 60,
  presets: ['binary', 'caterpillar', 'path', 'star'],
  beats: ['start', 'sizes', 'heavy', 'chains', 'query-path', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['n', 'x', 'k', 'c', 'sc', 'a', 'b', 'i', 'h', 'p', 'y', 'segs'],
  pointers: [],
  allow: [2],
  extra: FAMILY.slice(0, 20),
  bad: [
    { g: { n: 1, edges: [] }, u: 0, v: 0 },
    { g: { n: 3, edges: [[0, 1]] }, u: 0, v: 1 },
    {
      g: {
        n: 3,
        edges: [
          [0, 1],
          [1, 2],
          [0, 2],
        ],
      },
      u: 0,
      v: 1,
    },
    {
      g: {
        n: 3,
        edges: [
          [0, 1],
          [1, 2],
        ],
      },
      u: 3,
      v: 1,
    },
    {
      g: {
        n: 3,
        edges: [
          [0, 1],
          [1, 2],
        ],
      },
      u: 0,
      v: 9,
    },
    {
      g: {
        n: 3,
        edges: [
          [0, 1],
          [1, 2],
        ],
      },
      u: 0,
      v: 1,
      extra: 1,
    },
    {
      g: {
        n: 3,
        edges: [
          [0, 1],
          [1, 2],
        ],
      },
      u: 0,
    },
  ],
  predict: { heavy: { options: 3, expected: () => 0 } },
});

describe('hld: result', () => {
  it('the piece count equals the independent oracle (harness) and is within floor(log2 n) + 1', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      expect(String(lastSegs(input)), JSON.stringify(input)).toBe(harness.expected(input));
      expect(lastSegs(input)).toBeLessThanOrEqual(Math.floor(Math.log2(input.g.n)) + 1);
    }
  });

  it('the chains cover every node exactly once (one group colour per chain)', () => {
    for (const input of FAMILY.slice(0, 60)) {
      const f = gen(input).find((x) => beatOf(x).includes('chains'))!;
      const kinds = Object.entries(f.meta.highlights ?? {}).filter(([k]) => /^[A-Z]$/.test(k));
      expect(kinds).toHaveLength(input.g.n);
      for (const [, h] of kinds) expect(h).toMatch(/^group-[0-5]$/);
    }
  });

  it('subtree sizes are right and the root has size n; heavy edges are labelled', () => {
    for (const input of FAMILY.slice(0, 60)) {
      const f = gen(input).find((x) => beatOf(x).includes('sizes'))!;
      expect(f.state.nodes[0].note).toBe(String(input.g.n));
    }
    const last = gen(PRESETS[0]).at(-1)!;
    expect(last.state.nodes.filter((x) => x.edgeLabel).length).toBe(3);
  });

  it('presets: a straight path is one piece', () => {
    expect(lastSegs(PRESETS[2])).toBe(1);
  });

  it('frames fit maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
