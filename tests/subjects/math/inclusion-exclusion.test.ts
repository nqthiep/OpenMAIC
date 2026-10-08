import { describe, expect, it } from 'vitest';
import { inclusionExclusionEntry as entry } from '@/lib/subjects/math/catalog/inclusion-exclusion';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { r: number[] };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const PRESETS = entry.presets.map((p) => p.input as In);
const REGION_ORDER = ['a', 'b', 'c', 'ab', 'ac', 'bc', 'abc'];
const MASK = [1, 2, 4, 3, 5, 6, 7];

/** independent: real elements. Element e belongs to the sets given by the mask of its region. */
function elements(r: number[]): number[] {
  return r.flatMap((count, j) => Array.from({ length: count }, () => MASK[j]));
}
const inSet = (mask: number, set: 'A' | 'B' | 'C') => (mask & { A: 1, B: 2, C: 4 }[set]) !== 0;

function family(): In[] {
  const out: In[] = [];
  let x = 12345;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 200) out.push({ r: Array.from({ length: 7 }, () => next(10)) });
  out.push(
    { r: [0, 0, 0, 0, 0, 0, 0] },
    { r: [9, 9, 9, 9, 9, 9, 9] },
    { r: [0, 0, 0, 0, 0, 0, 9] },
  );
  return out;
}
const FAMILY = family();
const label = (f: Frame<FigState>, id: string) => f.state.points.find((p) => p.id === id)!.label!;

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m3-counting-advanced'],
  maxFrames: 10,
  presets: ['generic', 'empty-center', 'disjoint', 'nested'],
  beats: ['start', 'add', 'subtract', 'add-back', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: [
    'a',
    'b',
    'c',
    'ab',
    'ac',
    'bc',
    'abc',
    's',
    'sum',
    'sa',
    'sb',
    'sc',
    'sab',
    'sac',
    'sbc',
    'sabc',
    'u',
  ],
  pointers: [],
  allow: [2, 3],
  extra: FAMILY.slice(0, 40),
  bad: [
    { r: [1, 2, 3, 4, 5, 6] },
    { r: [1, 2, 3, 4, 5, 6, 7, 8] },
    { r: [1, 2, 3, 4, 5, 6, 10] },
    { r: [1, 2, 3, 4, 5, 6, -1] },
    { r: [1, 2, 3, 4, 5, 6, 0.5] },
    { r: [1, 2, 3, 4, 5, 6, 7], z: 1 },
    null,
  ],
  predict: {
    add: { options: 3, expected: () => 1 },
    subtract: { options: 3, expected: () => 0 },
  },
});

describe('inclusion-exclusion: the figure is the mathematics', () => {
  it('the union in the text is the number of distinct elements (independent: real elements), whatever the regions', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      const els = elements(i.r);
      const union = els.filter((m) => m !== 0).length;
      const last = gen(i).at(-1)!;
      expect((last.meta.vars as { u: number }).u, JSON.stringify(i)).toBe(union);
      const add = gen(i).find((f) => beatOf(f).includes('add-back'))!;
      expect((add.meta.vars as { sum: number }).sum).toBe(union);
    }
  });

  it('each step adds or subtracts the real size of the set or overlap, and the running sum follows', () => {
    for (const i of FAMILY) {
      const els = elements(i.r);
      const size = (pred: (m: number) => boolean) => els.filter(pred).length;
      const expected: [number, number][] = [
        [size((m) => inSet(m, 'A')), 0],
        [size((m) => inSet(m, 'B')), 0],
        [size((m) => inSet(m, 'C')), 0],
        [size((m) => inSet(m, 'A') && inSet(m, 'B')), 0],
        [size((m) => inSet(m, 'A') && inSet(m, 'C')), 0],
        [size((m) => inSet(m, 'B') && inSet(m, 'C')), 0],
        [size((m) => m === 7), 0],
      ];
      const frames = gen(i).slice(1, 8);
      let sum = 0;
      frames.forEach((f, j) => {
        const v = f.meta.vars as { s: number; sum: number };
        expect(v.s, `${JSON.stringify(i)} step ${j}`).toBe(expected[j][0]);
        sum += j < 3 || j === 6 ? v.s : -v.s;
        expect(v.sum).toBe(sum);
      });
    }
  });

  it('the label "count×times" is right: times = sets containing the element − overlaps containing it + the triple, and 1 at the end', () => {
    for (const i of FAMILY.slice(0, 80)) {
      const frames = gen(i);
      // the schedule: which sets are added, which overlaps are taken away, whether the triple is back
      const sched: { sets: string[]; pairs: string[]; triple: boolean }[] = [
        { sets: ['A'], pairs: [], triple: false },
        { sets: ['A', 'B'], pairs: [], triple: false },
        { sets: ['A', 'B', 'C'], pairs: [], triple: false },
        { sets: ['A', 'B', 'C'], pairs: ['AB'], triple: false },
        { sets: ['A', 'B', 'C'], pairs: ['AB', 'AC'], triple: false },
        { sets: ['A', 'B', 'C'], pairs: ['AB', 'AC', 'BC'], triple: false },
        { sets: ['A', 'B', 'C'], pairs: ['AB', 'AC', 'BC'], triple: true },
      ];
      sched.forEach((st, j) => {
        const f = frames[j + 1];
        REGION_ORDER.forEach((id, k) => {
          const m = MASK[k];
          let t = st.sets.filter((s) => inSet(m, s as 'A')).length;
          t -= st.pairs.filter((p) => inSet(m, p[0] as 'A') && inSet(m, p[1] as 'A')).length;
          if (st.triple && m === 7) t += 1;
          expect(label(f, `r${id}`), `${JSON.stringify(i)} step ${j} ${id}`).toBe(`${i.r[k]}×${t}`);
        });
      });
      // at the end every region that has elements is counted exactly once
      REGION_ORDER.forEach((id, k) => expect(label(frames[7], `r${id}`)).toBe(`${i.r[k]}×1`));
    }
  });

  it('the bare numbers at the start are the input', () => {
    for (const i of FAMILY.slice(0, 40)) {
      REGION_ORDER.forEach((id, k) => expect(label(gen(i)[0], `r${id}`)).toBe(String(i.r[k])));
    }
  });

  it('every named object exists in its frame; counts stay within maxFrames', () => {
    for (const i of [...FAMILY.slice(0, 80), ...PRESETS]) {
      const frames = gen(i);
      expect(frames).toHaveLength(9);
      for (const f of frames) {
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.circles.map((c) => c.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {})) expect(ids.has(k), k).toBe(true);
      }
    }
  });
});
