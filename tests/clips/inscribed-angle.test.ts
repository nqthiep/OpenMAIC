import { describe, expect, it } from 'vitest';
import inscribedAngle, {
  expectedDisplay,
  inscribedAngleEntry as entry,
} from '@/lib/subjects/math/clips/inscribed-angle';
import { clipContract } from './clip-contract';

type In = { arc: number };

const sweep: In[] = [];
for (let arc = 20; arc <= 340; arc++) sweep.push({ arc });

const RAD = Math.PI / 180;
type Pt = [number, number];
const onCircle = (deg: number): Pt => [Math.cos(deg * RAD), Math.sin(deg * RAD)];
/** the angle at `p` between the rays to `a` and `b`, in degrees, from the dot product (independent of the module) */
function angleAt(p: Pt, a: Pt, b: Pt): number {
  const u = [a[0] - p[0], a[1] - p[1]];
  const v = [b[0] - p[0], b[1] - p[1]];
  return (
    Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]))) / RAD
  );
}

clipContract<In>({
  module: inscribedAngle,
  presets: ['arc-100', 'arc-60', 'arc-180', 'arc-300'],
  chapters: [
    { id: 'circle', range: [8, 12] },
    { id: 'central', range: [10, 15] },
    { id: 'inscribed', range: [12, 18] },
    { id: 'cyclic', range: [10, 15] },
  ],
  bad: [
    { arc: 19 },
    { arc: 341 },
    { arc: 0 },
    { arc: 360 },
    { arc: -100 },
    { arc: 100.5 },
    { arc: '100' },
    { arc: 100, extra: 1 },
    {},
    null,
    100,
  ],
  edges: [{ arc: 20 }, { arc: 340 }, { arc: 180 }, { arc: 179 }, { arc: 181 }],
  display: ({ arc }) => ({ central: arc, inscribed: arc / 2 }),
  sweep,
});

describe('inscribed-angle: specifics', () => {
  it('the presets show the numbers from the card', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { central: 100, inscribed: 50 },
      { central: 60, inscribed: 30 },
      { central: 180, inscribed: 90 },
      { central: 300, inscribed: 150 },
    ]);
  });

  it('measured on the real circle: the angle at any point of the other arc equals arc/2 (within 1e-6 degrees)', () => {
    for (const arc of [20, 60, 100, 180, 250, 300, 340]) {
      const A = onCircle(0);
      const B = onCircle(arc); // arc AB measured counter-clockwise
      // the other arc runs from `arc` to 360 degrees; try 7 positions strictly inside it
      for (let k = 1; k <= 7; k++) {
        const P = onCircle(arc + (k * (360 - arc)) / 8);
        expect(angleAt(P, A, B), `arc ${arc} point ${k}`).toBeCloseTo(arc / 2, 6);
      }
    }
  });

  it('the angle at the centre equals the arc; the inscribed angle is half of it, never equal', () => {
    for (const arc of [20, 100, 180, 340]) {
      expect(angleAt([0, 0], onCircle(0), onCircle(arc))).toBeCloseTo(
        arc <= 180 ? arc : 360 - arc,
        6,
      );
    }
    for (const { arc } of sweep)
      expect(expectedDisplay({ arc }).inscribed).toBeLessThan(expectedDisplay({ arc }).central);
  });

  it('opposite angles of the cyclic quadrilateral add up to 180° on the real circle', () => {
    for (const arc of [40, 90, 130, 200, 310]) {
      const A = onCircle(0);
      const B = onCircle(arc);
      const P = onCircle(arc + (360 - arc) / 2); // on the other arc
      const Q = onCircle(arc / 2); // on arc AB
      expect(angleAt(P, A, B) + angleAt(Q, A, B)).toBeCloseTo(180, 6);
    }
  });

  it('a diameter (arc 180) gives the right angle of Thales', () => {
    expect(expectedDisplay({ arc: 180 }).inscribed).toBe(90);
  });

  it('a major arc seen from the minor arc gives an obtuse angle', () => {
    expect(expectedDisplay({ arc: 300 }).inscribed).toBeGreaterThan(90);
    expect(360 - 300 + 300).toBe(360); // the two arcs share the whole circle
  });
});
