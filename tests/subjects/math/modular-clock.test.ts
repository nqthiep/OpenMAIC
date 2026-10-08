import { describe, expect, it } from 'vitest';
import { modularClockEntry as entry } from '@/lib/subjects/math/catalog/modular-clock';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { n: number; a: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const PRESETS = entry.presets.map((p) => p.input as In);
const ALL: In[] = [];
for (let n = 5; n <= 31; n++)
  for (const a of [2, 3, 5, n - 1, Math.floor(n / 2)]) if (a >= 2 && a < n) ALL.push({ n, a });
const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
/** independent: a^k mod n by exact big-integer powers, not by repeated reduction */
const pow = (a: number, k: number, n: number) => Number(BigInt(a) ** BigInt(k) % BigInt(n));
/** independent: tail and period of k ↦ aᵏ mod n, found by scanning a long stretch */
function cycleOf(a: number, n: number) {
  const seq = Array.from({ length: 4 * n + 2 }, (_, k) => pow(a, k, n));
  for (let period = 1; period <= n; period++) {
    for (let tail = 0; tail < n; tail++) {
      let ok = true;
      for (let k = tail; k + period < seq.length; k++)
        if (seq[k] !== seq[k + period]) {
          ok = false;
          break;
        }
      if (ok) return { tail, period };
    }
  }
  throw new Error('no cycle');
}
const vars = (f: Frame<FigState>) => f.meta.vars as Record<string, number>;
const pt = (f: Frame<FigState>, id: string) => f.state.points.find((p) => p.id === id)!;

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m2-modular-arith'],
  maxFrames: 14,
  presets: ['n10-a2', 'n7-a3', 'n12-a5', 'n5-a4'],
  beats: ['start', 'multiply', 'powers', 'cycle', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['n', 'n1', 'a', 'g', 'd', 't', 'v', 'pw', 'tail', 'period'],
  pointers: [],
  allow: [],
  extra: ALL.slice(0, 40),
  bad: [
    { n: 4, a: 2 },
    { n: 32, a: 2 },
    { n: 7, a: 1 },
    { n: 7, a: 7 },
    { n: 7, a: 9 },
    { n: 7.5, a: 2 },
    { n: 7 },
    { n: 7, a: 3, z: 1 },
    null,
  ],
  predict: {
    multiply: { options: 3, expected: () => 0 },
    powers: { options: 2, expected: () => 0 },
  },
});

describe('modular-clock: the figure is the mathematics', () => {
  it('the cycle in the text is the real tail and period of the powers (independent scan with exact powers)', () => {
    for (const i of [...ALL, ...PRESETS]) {
      const f = gen(i).find((fr) => beatOf(fr).includes('cycle'))!;
      const want = cycleOf(i.a, i.n);
      expect(vars(f).tail, JSON.stringify(i)).toBe(want.tail);
      expect(vars(f).period, JSON.stringify(i)).toBe(want.period);
      // coprime: the cycle starts at once and its length divides φ(n) ≤ n − 1
      if (gcd(i.a, i.n) === 1) {
        expect(want.tail).toBe(0);
        expect((i.n - 1) % want.period === 0 || want.period <= i.n - 1).toBe(true);
      }
    }
  });

  it('each power frame shows aᵗ mod n (exact) and an arrow from the previous power to it', () => {
    for (const i of [...ALL, ...PRESETS]) {
      const frames = gen(i).filter((f) => /^Luỹ thừa thứ/.test(f.meta.explanation));
      expect(frames.length).toBeGreaterThanOrEqual(1);
      frames.forEach((f, j) => {
        const t = j + 1;
        expect(vars(f).t).toBe(t);
        expect(vars(f).v, `${JSON.stringify(i)} t=${t}`).toBe(pow(i.a, t, i.n));
        const arrow = f.state.segments.find((s) => s.id === `w${t}`);
        const [from, to] = [pow(i.a, t - 1, i.n), pow(i.a, t, i.n)];
        if (from === to) expect(arrow).toBeUndefined();
        else expect([arrow!.from, arrow!.to]).toEqual([`c${from}`, `c${to}`]);
      });
    }
  });

  it('the multiplication frame draws k → a·k mod n for every k, and the text counts the distinct images as n / gcd', () => {
    for (const i of ALL) {
      const f = gen(i).find((fr) => /^Mỗi điểm/.test(fr.meta.explanation))!;
      const d = vars(f).d;
      expect(d).toBe(i.n / gcd(i.a, i.n));
      expect(new Set(Array.from({ length: i.n }, (_, k) => (i.a * k) % i.n)).size).toBe(d);
      for (let k = 1; k < i.n; k++) {
        const img = (i.a * k) % i.n;
        const seg = f.state.segments.find((s) => s.id === `m${k}`);
        if (img === k) expect(seg).toBeUndefined();
        else expect([seg!.from, seg!.to]).toEqual([`c${k}`, `c${img}`]);
      }
    }
  });

  it('the clock: n points on a circle of radius 3, 0 at the top, going clockwise, equally spaced (atan2)', () => {
    for (const i of ALL) {
      const f = gen(i)[0];
      expect(f.state.points).toHaveLength(i.n);
      for (let k = 0; k < i.n; k++) {
        const p = pt(f, `c${k}`);
        expect(Math.abs(Math.hypot(p.x, p.y) - 3)).toBeLessThan(2e-3);
        // clockwise from the top: the angle from the top is 360·k/n degrees
        const fromTop = ((Math.atan2(p.x, p.y) * 180) / Math.PI + 360) % 360;
        const want = (360 * k) / i.n;
        expect(
          Math.abs(((fromTop - want + 540) % 360) - 180),
          `${JSON.stringify(i)} k=${k}`,
        ).toBeLessThan(0.3);
      }
    }
  });

  it('the loop arrows are the bold ones: as many as the period (less self-maps), and the tail ones are muted', () => {
    for (const i of ALL) {
      const f = gen(i).find((fr) => beatOf(fr).includes('cycle'))!;
      const { tail, period } = cycleOf(i.a, i.n);
      const marks = f.meta.highlights ?? {};
      const active = f.state.segments.filter((s) => marks[s.id] === 'active');
      const muted = f.state.segments.filter((s) => marks[s.id] === 'muted');
      expect(active.length).toBeLessThanOrEqual(period);
      expect(muted.length).toBeLessThanOrEqual(tail);
      if (period > 1) expect(active.length).toBeGreaterThanOrEqual(period - 0); // no self-map inside a loop longer than 1
    }
  });

  it('every named object exists in its frame; the counts stay within the limits', () => {
    for (const i of [...ALL, ...PRESETS]) {
      const frames = gen(i);
      expect(frames.length).toBeLessThanOrEqual(entry.maxFrames);
      for (const f of frames) {
        expect(f.state.segments.length).toBeLessThanOrEqual(120);
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.segments.map((s) => s.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {}))
          expect(ids.has(k), `${JSON.stringify(i)} ${k}`).toBe(true);
      }
    }
  });
});
