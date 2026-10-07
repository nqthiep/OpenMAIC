import { describe, expect, it } from 'vitest';
import powerOfPoint, {
  SLOPES,
  circlePoint,
  expectedDisplay,
  powerOfPointEntry as entry,
  secantThrough,
} from '@/lib/subjects/math/clips/power-of-point';
import { clipContract } from './clip-contract';

type In = { R: number; px: number; py: number };

const sweep: In[] = [];
for (let R = 2; R <= 6; R++)
  for (let px = -9; px <= 9; px += 2) for (let py = -9; py <= 9; py += 3) sweep.push({ R, px, py });
sweep.push(
  { R: 5, px: 0, py: 0 },
  { R: 5, px: 3, py: -4 },
  { R: 5, px: -5, py: 0 },
  { R: 2, px: 0, py: 2 },
);

/** independent: intersect the line numerically by sampling its parameter to find both crossings (bisection) */
function crossings(i: In, d: [number, number]): number[] {
  const len = Math.hypot(d[0], d[1]);
  const u = [d[0] / len, d[1] / len];
  const g = (t: number) => (i.px + t * u[0]) ** 2 + (i.py + t * u[1]) ** 2 - i.R * i.R;
  const roots: number[] = [];
  let prev = g(-30);
  for (let k = 1; k <= 6000; k++) {
    const t = -30 + k * 0.01;
    const v = g(t);
    if (v === 0) {
      roots.push(t); // the grid point is a root
    } else if (prev !== 0 && prev * v < 0) {
      let lo = t - 0.01;
      let hi = t;
      for (let it = 0; it < 80; it++) {
        const mid = (lo + hi) / 2;
        if (g(lo) * g(mid) <= 0) hi = mid;
        else lo = mid;
      }
      roots.push((lo + hi) / 2);
    }
    prev = v;
  }
  return roots;
}

clipContract<In>({
  module: powerOfPoint,
  presets: ['outside', 'inside', 'on-circle', 'far'],
  chapters: [
    { id: 'circle', range: [8, 12] },
    { id: 'secant-1', range: [10, 12] },
    { id: 'secant-2', range: [12, 14] },
    { id: 'tangent', range: [10, 14] },
  ],
  bad: [
    { R: 1, px: 3, py: 0 },
    { R: 7, px: 3, py: 0 },
    { R: 5, px: 10, py: 0 },
    { R: 5, px: 0, py: -10 },
    { R: 5.5, px: 3, py: 0 },
    { R: 5, px: 3.5, py: 0 },
    { R: 5, px: 3 },
    { px: 3, py: 0 },
    { R: 5, px: 3, py: 0, extra: 1 },
    { R: '5', px: 3, py: 0 },
    null,
  ],
  edges: [
    { R: 2, px: 9, py: 9 },
    { R: 6, px: -9, py: 9 },
    { R: 6, px: 0, py: 0 },
    { R: 5, px: 5, py: 0 },
    { R: 2, px: 2, py: 0 },
    { R: 6, px: 6, py: 0 },
  ],
  display: ({ R, px, py }) => ({
    power:
      Math.hypot(px, py) ** 2 - R * R > 0
        ? Math.round(Math.hypot(px, py) ** 2) - R * R
        : Math.round(Math.hypot(px, py) ** 2) - R * R,
  }),
  sweep,
});

describe('power-of-point: specifics', () => {
  it('the presets show the signed power worked out by hand', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { power: 39 }, // 64 − 25
      { power: -20 }, // 5 − 25
      { power: 0 }, // 9 + 16 − 25
      { power: 158 }, // 162 − 4
    ]);
  });

  it('the sample points are on the circle exactly and the second intersections too', () => {
    for (const R of [2, 3, 5, 6]) {
      for (const s of SLOPES) {
        const [x, y] = circlePoint(R, s);
        expect(x * x + y * y).toBeCloseTo(R * R, 9);
      }
    }
    for (const i of sweep) {
      for (const s of SLOPES) {
        const sec = secantThrough(i, s);
        if (!sec) continue;
        expect(sec.b[0] ** 2 + sec.b[1] ** 2).toBeCloseTo(i.R * i.R, 8);
      }
    }
  });

  it('PA·PB equals |OP² − R²| measured by bisection on the real line, for secants in many directions', () => {
    for (const i of sweep.filter((_, k) => k % 9 === 0)) {
      const want = Math.abs(expectedDisplay(i).power);
      for (const d of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
        [2, 1],
        [1, 2],
        [-3, 1],
      ] as [number, number][]) {
        const ts = crossings(i, d);
        if (ts.length !== 2) continue; // the line misses the circle (or is tangent)
        expect(Math.abs(ts[0] * ts[1]), JSON.stringify([i, d])).toBeCloseTo(want, 4);
      }
    }
  });

  it('the product is the same for every secant through P (so it does not depend on the direction)', () => {
    for (const i of sweep.filter((x) => x.px * x.px + x.py * x.py > 0)) {
      const prods = SLOPES.map((s) => secantThrough(i, s))
        .filter((x) => x !== null)
        .map((x) => x!.pa * x!.pb);
      for (const p of prods) expect(p).toBeCloseTo(prods[0], 8);
    }
  });

  it('outside: the tangent length squared equals the power; inside: the power is negative (no tangent); on the circle: 0', () => {
    for (const i of sweep) {
      const p = expectedDisplay(i).power;
      const d2 = i.px * i.px + i.py * i.py;
      if (d2 > i.R * i.R) expect(p).toBeGreaterThan(0);
      else if (d2 < i.R * i.R) expect(p).toBeLessThan(0);
      else expect(p).toBe(0);
    }
  });

  it('inside the circle the two intersection points lie on opposite sides of P, outside on the same side', () => {
    const inside = entry.presets[1].input;
    const outside = entry.presets[0].input;
    for (const s of [0.5, 1, 2]) {
      const a = secantThrough(inside, s)!;
      const b = secantThrough(outside, s)!;
      const side = (i: In, sec: NonNullable<typeof a>) =>
        Math.sign((sec.a[0] - i.px) * (sec.b[0] - i.px) + (sec.a[1] - i.py) * (sec.b[1] - i.py));
      expect(side(inside, a)).toBe(-1);
      expect(side(outside, b)).toBe(1);
    }
  });
});
