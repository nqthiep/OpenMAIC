import { describe, expect, it } from 'vitest';
import inclusionExclusion, {
  expectedDisplay,
  inclusionExclusionEntry as entry,
  setSizes,
  unionByFormula,
} from '@/lib/subjects/math/clips/inclusion-exclusion';
import { clipContract } from './clip-contract';

type In = { r: number[] };

function family(): In[] {
  const out: In[] = [];
  let x = 31;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  for (let t = 0; t < 400; t++)
    out.push({ r: Array.from({ length: 7 }, () => (next(3) === 0 ? 0 : next(10))) });
  // every pattern of empty and full regions
  for (let mask = 0; mask < 128; mask++)
    out.push({ r: Array.from({ length: 7 }, (_, k) => ((mask >> k) & 1 ? 9 : 0)) });
  return out;
}
const sweep = family();

/** independent: build the real sets from the regions and take the union of the actual elements */
function realSets(r: number[]) {
  // elements are numbered 0.. ; the first r[0] belong to "only A", the next r[1] to "only B", and so on
  const membership = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  const A = new Set<number>();
  const B = new Set<number>();
  const C = new Set<number>();
  let id = 0;
  r.forEach((count, region) => {
    for (let k = 0; k < count; k++, id++) {
      if (membership[region][0]) A.add(id);
      if (membership[region][1]) B.add(id);
      if (membership[region][2]) C.add(id);
    }
  });
  return { A, B, C };
}

clipContract<In>({
  module: inclusionExclusion,
  presets: ['generic', 'empty-center', 'disjoint', 'nested'],
  chapters: [
    { id: 'venn', range: [8, 12] },
    { id: 'add', range: [10, 12] },
    { id: 'subtract', range: [12, 14] },
    { id: 'add-back', range: [10, 14] },
  ],
  bad: [
    { r: [1, 2, 3, 4, 5, 6] },
    { r: [1, 2, 3, 4, 5, 6, 7, 8] },
    { r: [1, 2, 3, 4, 5, 6, 10] },
    { r: [-1, 2, 3, 4, 5, 6, 7] },
    { r: [1, 2, 3, 4, 5, 6, 0.5] },
    { r: [1, 2, 3, 4, 5, 6, '7'] },
    { r: 'abc' },
    { r: [1, 2, 3, 4, 5, 6, 7], extra: 1 },
    {},
    null,
  ],
  edges: [
    { r: [0, 0, 0, 0, 0, 0, 0] },
    { r: [9, 9, 9, 9, 9, 9, 9] },
    { r: [0, 0, 0, 0, 0, 0, 9] },
    { r: [9, 0, 0, 0, 0, 0, 0] },
    { r: [0, 0, 0, 9, 9, 9, 0] },
  ],
  display: ({ r }) => {
    const { A, B, C } = realSets(r);
    return { union: new Set([...A, ...B, ...C]).size, A: A.size, B: B.size, C: C.size };
  },
  sweep,
});

describe('inclusion-exclusion: specifics', () => {
  it('the presets show the numbers worked out by hand', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { union: 14, A: 7, B: 5, C: 8 }, // 3+2+4+1+2+1+1; |A| = 3+1+2+1; |B| = 2+1+1+1; |C| = 4+2+1+1
      { union: 13, A: 6, B: 4, C: 7 },
      { union: 9, A: 3, B: 2, C: 4 },
      { union: 10, A: 7, B: 8, C: 4 }, // C is inside A ∩ B: |C| = |A∩B∩C|
    ]);
  });

  it('the formula equals the size of the real union, on 528 inputs including every empty/full pattern', () => {
    for (const { r } of sweep) {
      const { A, B, C } = realSets(r);
      expect(unionByFormula(r), JSON.stringify(r)).toBe(new Set([...A, ...B, ...C]).size);
    }
  });

  it('adding only |A|+|B|+|C| over-counts exactly the overlaps; "subtract the pairs only" under-counts by |A∩B∩C|', () => {
    for (const { r } of sweep) {
      const s = setSizes(r);
      const union = unionByFormula(r);
      expect(s.A + s.B + s.C - union).toBe(s.AB + s.AC + s.BC - s.ABC); // regions in two sets are counted once too often, the middle twice too often
      expect(s.A + s.B + s.C - s.AB - s.AC - s.BC - union).toBe(0 - s.ABC); // missing the add-back is short by |A∩B∩C|
    }
  });

  it('each region is counted once after the three steps: 1, 2 or 3 times at the start, 1, 1, 0 after subtracting, 1 at the end', () => {
    // a region in k sets: counted k times by the sum, minus C(k, 2) by the pairs, plus C(k, 3) by the triple
    for (const [k, afterAdd, afterSub, final] of [
      [1, 1, 1, 1],
      [2, 2, 1, 1],
      [3, 3, 0, 1],
    ]) {
      const pairs = k === 1 ? 0 : k === 2 ? 1 : 3;
      const triple = k === 3 ? 1 : 0;
      expect(k).toBe(afterAdd);
      expect(k - pairs).toBe(afterSub);
      expect(k - pairs + triple).toBe(final);
    }
  });

  it('the nested preset has C inside A ∩ B: |C| equals |A ∩ B ∩ C|', () => {
    const r = entry.presets[3].input.r;
    const s = setSizes(r);
    expect(s.C).toBe(s.ABC);
  });

  it('disjoint sets: the union is the plain sum', () => {
    const r = entry.presets[2].input.r;
    const s = setSizes(r);
    expect(unionByFormula(r)).toBe(s.A + s.B + s.C);
  });
});
