import { describe, expect, it } from 'vitest';
import { cauchySchwarzEntry as entry } from '@/lib/subjects/math/catalog/cauchy-schwarz';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { a1: number; a2: number; b1: number; b2: number };
type Node = { id: string; kind: string; text: string; parent?: string; status?: string };
type S = { nodes: Node[] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const PRESETS = entry.presets.map((p) => p.input as In);

function family(): In[] {
  const out: In[] = [];
  let x = 7;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  for (let t = 0; t < 150; t++) {
    out.push({ a1: next(11) - 5, a2: next(11) - 5, b1: next(11) - 5, b2: next(11) - 5 });
  }
  return out;
}
const FAMILY = family();
// every pair of the 11^4 grid corners and a few proportional ones
const PROPORTIONAL: In[] = [
  { a1: 2, a2: 3, b1: 4, b2: 6 },
  { a1: -1, a2: 2, b1: 3, b2: -6 },
  { a1: 0, a2: 5, b1: 0, b2: -2 },
  { a1: 0, a2: 0, b1: 0, b2: 0 },
];

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'proofOutline',
  topics: ['m2-inequality-classic'],
  maxFrames: 20,
  presets: ['generic', 'proportional', 'zero', 'negative'],
  beats: ['start', 'given', 'expand', 'lagrange', 'conclude', 'equality', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: ['a1', 'a2', 'b1', 'b2', 'L', 'R', 'd', 'k'],
  pointers: [],
  allow: [1],
  extra: [...FAMILY.slice(0, 25), ...PROPORTIONAL],
  bad: [
    { a1: 6, a2: 0, b1: 0, b2: 0 },
    { a1: -6, a2: 0, b1: 0, b2: 0 },
    { a1: 1.5, a2: 0, b1: 0, b2: 0 },
    { a1: 1, a2: 2, b1: 3 },
    { a1: 1, a2: 2, b1: 3, b2: 4, c: 5 },
    { a1: '1', a2: 2, b1: 3, b2: 4 },
    null,
    [1, 2, 3, 4],
  ],
  predict: {
    lagrange: {
      options: 2,
      expected: (input) => {
        // independent: which of the two candidate expressions squares to R - L?
        const diff =
          (input.a1 ** 2 + input.a2 ** 2) * (input.b1 ** 2 + input.b2 ** 2) -
          (input.a1 * input.b1 + input.a2 * input.b2) ** 2;
        return (input.a1 * input.b2 - input.a2 * input.b1) ** 2 === diff ? 0 : 1;
      },
    },
  },
});

const lhs = (i: In) => (i.a1 * i.b1 + i.a2 * i.b2) ** 2;
const rhs = (i: In) => (i.a1 ** 2 + i.a2 ** 2) * (i.b1 ** 2 + i.b2 ** 2);

describe('cauchy-schwarz: numbers', () => {
  it('the frames show both sides and the difference computed from the input', () => {
    for (const input of [...FAMILY, ...PRESETS, ...PROPORTIONAL]) {
      const frames = gen(input);
      const expand = frames.find((f) => beatOf(f).includes('expand'))!;
      expect(expand.meta.vars, JSON.stringify(input)).toEqual({ L: lhs(input), R: rhs(input) });
      const lag = frames.find((f) => beatOf(f).includes('lagrange'))!;
      expect(lag.meta.vars!.d).toBe(rhs(input) - lhs(input));
    }
  });

  it('Lagrange: the difference equals (a1·b2 − a2·b1)² on every input, and it is never negative', () => {
    for (const input of [...FAMILY, ...PRESETS, ...PROPORTIONAL]) {
      const d = rhs(input) - lhs(input);
      expect(d).toBe((input.a1 * input.b2 - input.a2 * input.b1) ** 2);
      expect(d).toBeGreaterThanOrEqual(0);
      const reveal = gen(input).find((f) => f.meta.vars && 'k' in f.meta.vars)!;
      expect(reveal.meta.vars).toEqual({ k: input.a1 * input.b2 - input.a2 * input.b1, d });
    }
  });

  it('equality holds exactly for proportional pairs, and the equality node is marked done then', () => {
    for (const input of [...FAMILY, ...PRESETS, ...PROPORTIONAL]) {
      const eq = gen(input).find((f) => beatOf(f).includes('equality'))!;
      const proportional = input.a1 * input.b2 === input.a2 * input.b1;
      const node = eq.state.nodes.find((x) => x.id === 'equal')!;
      expect(node.status).toBe(proportional ? 'done' : 'pending');
      expect(lhs(input) === rhs(input)).toBe(proportional);
    }
    expect(gen(PRESETS[1]).find((f) => beatOf(f).includes('equality'))!.meta.explanation).toMatch(
      /tỉ lệ/,
    );
    expect(gen(PRESETS[0]).find((f) => beatOf(f).includes('equality'))!.meta.explanation).toMatch(
      /không xảy ra/,
    );
  });

  it('presets: generic 1,2,3,4 gives 121 and 125; zero gives 0 and 0; negative gives 64 and 80', () => {
    const vars = (p: In, beat: string) => gen(p).find((f) => beatOf(f).includes(beat))!.meta.vars;
    expect(vars(PRESETS[0], 'expand')).toEqual({ L: 121, R: 125 });
    expect(vars(PRESETS[1], 'expand')).toEqual({ L: 100, R: 100 });
    expect(vars(PRESETS[2], 'expand')).toEqual({ L: 0, R: 0 });
    expect(vars(PRESETS[3], 'expand')).toEqual({ L: 64, R: 80 });
  });
});

describe('cauchy-schwarz: the proof tree', () => {
  it('only grows from frame to frame (nodes are never removed or reordered), ends with the goal', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const frames = gen(input);
      let prev: string[] = [];
      for (const f of frames) {
        const ids = f.state.nodes.map((x) => x.id);
        expect(ids.slice(0, prev.length)).toEqual(prev);
        prev = ids;
      }
      expect(prev).toEqual([
        'g',
        'goal',
        'nums',
        'left',
        'right',
        'diff',
        'identity',
        'square',
        'main',
        'equal',
      ]);
    }
  });

  it('every parent exists earlier in the list; kinds are the five proof kinds; formulas use \\( \\) and no braces', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const last = gen(input).at(-1)!;
      const seen = new Set<string>();
      for (const node of last.state.nodes) {
        expect(['given', 'goal', 'have', 'because', 'therefore']).toContain(node.kind);
        if (node.parent) expect(seen.has(node.parent), `${node.id} parent`).toBe(true);
        seen.add(node.id);
        expect(node.text).not.toMatch(/[{}]/); // braces would be read as '{var}' placeholders
        const opens = (node.text.match(/\\\(/g) ?? []).length;
        const closes = (node.text.match(/\\\)/g) ?? []).length;
        expect(opens).toBe(closes);
      }
    }
  });

  it('the numbers in the tree are the numbers of the input', () => {
    const f = gen({ a1: -1, a2: 3, b1: 2, b2: -2 }).at(-1)!;
    const text = (id: string) => f.state.nodes.find((x) => x.id === id)!.text;
    expect(text('nums')).toContain('a_1 = -1, a_2 = 3, b_1 = 2, b_2 = -2');
    expect(text('left')).toContain('((-1)\\cdot 2 + 3\\cdot (-2))^2 = 64');
    expect(text('right')).toContain('= 80');
  });

  it('frame counts stay within maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
