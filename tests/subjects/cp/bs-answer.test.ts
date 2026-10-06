import { describe, expect, it } from 'vitest';
import { bsAnswerEntry as entry } from '@/lib/subjects/cp/catalog/bs-answer';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { h: number[]; m: number };
type S = { values: number[]; mode: 'bars'; threshold?: { value: number; label: string } };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const wood = (h: readonly number[], H: number): number =>
  h.reduce((s, x) => s + Math.max(0, x - H), 0);
const total = (h: readonly number[]): number => h.reduce((s, x) => s + x, 0);

/** Independent oracle: try every H from max(h) down to 0, keep the largest with enough wood. */
function best(h: readonly number[], m: number): number {
  for (let H = Math.max(...h); H >= 0; H--) if (wood(h, H) >= m) return H;
  return -1;
}

/** Small exhaustive family: every h in {1..4}^k for k <= 3 and every valid m. */
function* family(): Generator<In> {
  for (let k = 1; k <= 3; k++) {
    for (let code = 0; code < 4 ** k; code++) {
      const h: number[] = [];
      for (let t = 0, c = code; t < k; t++, c = Math.floor(c / 4)) h.push((c % 4) + 1);
      for (let m = 1; m <= total(h); m++) yield { h, m };
    }
  }
}
const WIDE: In[] = [
  { h: [40, 40, 40, 40, 40, 40, 40, 40], m: 100 },
  { h: [40, 1, 1, 1, 1, 1, 1, 1], m: 1 },
  { h: [40], m: 40 },
  { h: [1], m: 1 },
  { h: [1, 2, 3, 4, 5, 6, 7, 8], m: 36 },
];

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t2-binary-search'],
  maxFrames: 60,
  presets: ['classic', 'all-equal', 'one-tree', 'take-all', 'tiny-need'],
  beats: ['start', 'brute', 'monotonic', 'check', 'narrow', 'boundary', 'done'],
  required: ['start', 'done'],
  pseudoLines: 7,
  vars: ['n', 'm', 'top', 'H', 'got', 'tried', 'Hold', 'gotOld', 'lo', 'hi', 'mid'],
  pointers: [],
  allow: [1],
  subtasks: 3,
  extra: [...WIDE, ...[...family()].filter((_, k) => k % 7 === 0)],
  bad: [
    { h: [1, 2], m: 4 },
    { h: [], m: 1 },
    { h: Array.from({ length: 9 }, () => 1), m: 1 },
    { h: [41], m: 1 },
    { h: [0], m: 1 },
    { h: [5], m: 0 },
    { h: [5], m: 101 },
    { h: [5], m: 1.5 },
    { h: [5], m: 1, extra: 1 },
    { h: [5] },
  ],
  predict: {
    monotonic: {
      options: 3,
      expected: (input, frames, idx) => {
        const H = frames[idx].meta.vars!.H as number;
        const before = wood(input.h, H);
        const after = wood(input.h, H + 1);
        return after > before ? 0 : after < before ? 1 : 2;
      },
    },
    check: {
      options: 2,
      expected: (input, frames, idx) => {
        const { mid, m } = frames[idx].meta.vars as { mid: number; m: number };
        return wood(input.h, mid) >= m ? 0 : 1;
      },
    },
    narrow: {
      options: 2,
      // enough wood: the answer is mid or higher (right); not enough: lower (left)
      expected: (input, frames, idx) => {
        const { mid, m } = frames[idx].meta.vars as { mid: number; m: number };
        return wood(input.h, mid) >= m ? 1 : 0;
      },
    },
  },
});

describe('bs-answer: result', () => {
  it('the answer equals the brute-force oracle (exhaustive on the small family, plus wide ones)', () => {
    let runs = 0;
    for (const input of [...family(), ...WIDE]) {
      const frames = gen(input);
      const last = frames[frames.length - 1];
      expect(last.meta.vars?.lo, JSON.stringify(input)).toBe(best(input.h, input.m));
      expect(last.state.threshold?.value).toBe(best(input.h, input.m));
      expect(last.meta.vars!.got as number).toBeGreaterThanOrEqual(input.m);
      expect(beatOf(last)).toEqual(['done']);
      runs++;
    }
    expect(runs).toBeGreaterThan(200);
  });

  it('presets: the answers of the five cards', () => {
    const lo = (id: string) =>
      gen(entry.presets.find((p) => p.id === id)!.input).at(-1)!.meta.vars!.lo;
    expect(lo('classic')).toBe(15);
    expect(lo('all-equal')).toBe(3);
    expect(lo('one-tree')).toBe(18);
    expect(lo('take-all')).toBe(0);
    expect(lo('tiny-need')).toBe(8);
  });

  it('every check verdict agrees with wood(mid) >= m, and lo / hi move the right way', () => {
    for (const input of [...WIDE, ...[...family()].filter((_, k) => k % 5 === 0)]) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('narrow')) return;
        const { lo, hi, mid, got, m } = f.meta.vars as Record<string, number>;
        expect(got).toBe(wood(input.h, mid));
        const next = frames[k + 1].meta.vars as { lo: number; hi: number };
        if (got >= m) expect([next.lo, next.hi]).toEqual([mid, hi]);
        else expect([next.lo, next.hi]).toEqual([lo, mid - 1]);
      });
    }
  });

  it('the invariant holds: wood(lo) >= m on every search frame, and the range shrinks', () => {
    for (const input of [...WIDE, ...[...family()].filter((_, k) => k % 5 === 0)]) {
      let width = Infinity;
      for (const f of gen(input)) {
        const v = f.meta.vars as { lo?: number; hi?: number; mid?: number };
        if (v.lo === undefined || v.hi === undefined || v.mid !== undefined) continue;
        expect(wood(input.h, v.lo)).toBeGreaterThanOrEqual(input.m);
        expect(v.hi - v.lo).toBeLessThanOrEqual(width);
        width = v.hi - v.lo;
      }
    }
  });

  it('mid rounds up: lo < mid <= hi on every check frame', () => {
    for (const input of [...WIDE, ...[...family()].filter((_, k) => k % 5 === 0)]) {
      for (const f of gen(input)) {
        if (!beatOf(f).includes('check')) continue;
        const { lo, hi, mid } = f.meta.vars as Record<string, number>;
        expect(mid).toBe(Math.floor((lo + hi + 1) / 2));
        expect(mid).toBeGreaterThan(lo);
        expect(mid).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('beat order: start, brute, monotonic, then check/narrow pairs, boundary, done', () => {
    for (const p of entry.presets) {
      const seq = beats(gen(p.input));
      expect(seq.slice(0, 3)).toEqual(['start', 'brute', 'monotonic']);
      expect(seq.slice(-2)).toEqual(['boundary', 'done']);
      const mid = seq.slice(3, -2);
      expect(mid.length % 2).toBe(0);
      mid.forEach((b, k) => expect(b).toBe(k % 2 === 0 ? 'check' : 'narrow'));
    }
  });

  it('the start frame has no threshold and states n and m', () => {
    const f = gen(entry.presets[0].input)[0];
    expect(f.state.threshold).toBeUndefined();
    expect(f.meta.vars).toMatchObject({ n: 4, m: 7, top: 20 });
  });

  it('the check frame (the question) hides the wood and the verdict', () => {
    for (const p of entry.presets) {
      for (const f of gen(p.input, 'en-US')) {
        if (!beatOf(f).includes('check')) continue;
        expect(f.meta.vars).not.toHaveProperty('got');
        expect(f.meta.explanation).not.toMatch(/meters|not enough/);
      }
    }
  });

  it('frame counts fit maxFrames (taller trees need more rounds, at most ~log2 of the top)', () => {
    for (const input of [...WIDE, ...family()]) {
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
    }
  });

  it('check() of the input still holds for the presets (m <= sum of h)', () => {
    for (const p of entry.presets) expect(p.input.m).toBeLessThanOrEqual(total(p.input.h));
  });
});
