import { describe, expect, it } from 'vitest';
import {
  MAX_CURVE_POINTS,
  PLOT,
  clipCurve,
  describePlot,
  formatTick,
  niceTicks,
  readMarks,
  toPlot,
} from '@/lib/tutor/runtime/visualizers/function-plotter';

const B = { xmin: 0, xmax: 10, ymin: 0, ymax: 10 };

describe('niceTicks', () => {
  it('uses steps of 1, 2 or 5 times a power of ten and stays inside the range', () => {
    expect(niceTicks(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(-5, 5)).toEqual([-4, -2, 0, 2, 4]);
    expect(niceTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(3, 47)).toEqual([10, 20, 30, 40]); // raw step 7.33 rounds up to 10
  });

  it('has no floating-point noise (0.1 steps)', () => {
    expect(niceTicks(0, 0.6, 6)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  });

  it('every tick is inside [min, max] and the count is near the target', () => {
    for (const [lo, hi] of [
      [-3.7, 8.2],
      [0.001, 0.009],
      [1e6, 5e6],
      [-1, 1],
    ] as const) {
      const t = niceTicks(lo, hi);
      expect(t.length).toBeGreaterThanOrEqual(2);
      expect(t.length).toBeLessThanOrEqual(12);
      for (const v of t) {
        expect(v).toBeGreaterThanOrEqual(lo - 1e-12);
        expect(v).toBeLessThanOrEqual(hi + 1e-12);
      }
    }
  });

  it('returns [] for an empty, reversed or non-finite range', () => {
    expect(niceTicks(5, 5)).toEqual([]);
    expect(niceTicks(5, 1)).toEqual([]);
    expect(niceTicks(NaN, 1)).toEqual([]);
    expect(niceTicks(0, Infinity)).toEqual([]);
    expect(niceTicks(0, 1, 0)).toEqual([]);
  });
});

describe('formatTick', () => {
  it('rounds to 4 significant digits, drops -0 and trailing zeros, and is locale-free', () => {
    expect(formatTick(2)).toBe('2');
    expect(formatTick(0.30000000000000004)).toBe('0.3');
    expect(formatTick(-0)).toBe('0');
    expect(formatTick(1234.5678)).toBe('1235');
    expect(formatTick(NaN)).toBe('');
  });
});

describe('clipCurve', () => {
  it('keeps a curve that is wholly inside as one polyline', () => {
    expect(
      clipCurve(
        [
          [1, 1],
          [2, 4],
          [3, 9],
        ],
        B,
      ),
    ).toEqual([
      [
        [1, 1],
        [2, 4],
        [3, 9],
      ],
    ]);
  });

  it('cuts at the frame edge exactly (x² leaving through the top)', () => {
    const [piece] = clipCurve(
      [
        [2, 4],
        [4, 16],
      ],
      B,
    );
    expect(piece[0]).toEqual([2, 4]);
    expect(piece[1][1]).toBeCloseTo(10);
    expect(piece[1][0]).toBeCloseTo(2 + (6 / 12) * 2); // 6 of the 12 rise, 2 of the 2 run
  });

  it('splits a curve that leaves the frame and comes back (two polylines)', () => {
    const pieces = clipCurve(
      [
        [1, 5],
        [2, 20],
        [3, 20],
        [4, 5],
      ],
      B,
    );
    expect(pieces).toHaveLength(2);
    expect(pieces[0][0]).toEqual([1, 5]);
    expect(pieces[1].at(-1)).toEqual([4, 5]);
    for (const p of pieces.flat()) expect(p[1]).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('breaks at a non-finite point (function undefined there) and drops pieces with one point', () => {
    expect(
      clipCurve(
        [
          [1, 1],
          [2, NaN],
          [3, 3],
          [4, 4],
        ],
        B,
      ),
    ).toEqual([
      [
        [3, 3],
        [4, 4],
      ],
    ]);
    expect(
      clipCurve(
        [
          [1, 1],
          [2, Infinity],
          [3, 3],
        ],
        B,
      ),
    ).toEqual([]);
    expect(clipCurve([[1, 1], 'x', [3, 3]], B)).toEqual([]);
  });

  it('drops a curve that is outside the frame, and tolerates a non-array', () => {
    expect(
      clipCurve(
        [
          [20, 1],
          [30, 2],
        ],
        B,
      ),
    ).toEqual([]);
    expect(clipCurve(undefined, B)).toEqual([]);
    expect(clipCurve('abc', B)).toEqual([]);
  });

  it('uses at most MAX_CURVE_POINTS points', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => [i / 100, 1]);
    const pieces = clipCurve(pts, { xmin: 0, xmax: 100, ymin: 0, ymax: 2 });
    expect(pieces.flat().length).toBeLessThanOrEqual(MAX_CURVE_POINTS);
  });
});

describe('toPlot / readMarks / describePlot', () => {
  it('maps the corners of the bounds to the corners of the plot box, y flipped', () => {
    const { sx, sy } = toPlot(B);
    expect(sx(0)).toBe(PLOT.left);
    expect(sx(10)).toBe(PLOT.left + PLOT.w);
    expect(sy(0)).toBe(PLOT.top + PLOT.h);
    expect(sy(10)).toBe(PLOT.top);
  });

  it('reads valid marks only, clips labels and caps the count', () => {
    const marks = readMarks([
      { id: 'a', x: 1, y: 2, label: 'averyverylonglabel' },
      { id: '', x: 1, y: 2, label: 'x' },
      { id: 'b', x: NaN, y: 2, label: 'x' },
      { id: 'c', x: 3, y: 4 },
    ]);
    expect(marks).toEqual([
      { id: 'a', x: 1, y: 2, label: 'averyve…' },
      { id: 'c', x: 3, y: 4, label: '' },
    ]);
    expect(
      readMarks(Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, x: i, y: i, label: '' }))),
    ).toHaveLength(12);
  });

  it('describes curves, marks and vertical lines with highlight kinds', () => {
    expect(
      describePlot(
        [{ id: 'f', n: 3 }],
        [{ id: 'max', x: 1.5, y: 2, label: 'cực đại' }],
        [{ id: 'asym', x: 4 }],
        { f: 'active', max: 'bogus' },
      ),
    ).toBe('curves: f (active) (3 points); marks: max (1.5, 2); vertical lines: asym (x = 4)');
  });
});
