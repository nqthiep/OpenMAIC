import { describe, expect, it } from 'vitest';
import {
  MAX_POINTS,
  angleArc,
  clipLine,
  describeGeometry,
  parseBounds,
  readPoints,
  toScreen,
} from '@/lib/tutor/runtime/visualizers/geometry';

const B = { xmin: 0, xmax: 10, ymin: 0, ymax: 10 };

describe('parseBounds', () => {
  it('keeps a valid box and falls back to [0,10]² for missing, wrong or empty ones', () => {
    expect(parseBounds({ xmin: -2, xmax: 4, ymin: 1, ymax: 3 })).toEqual({
      xmin: -2,
      xmax: 4,
      ymin: 1,
      ymax: 3,
    });
    for (const bad of [
      undefined,
      null,
      5,
      {},
      { xmin: 1, xmax: 1, ymin: 0, ymax: 1 },
      { xmin: 0, xmax: 'a', ymin: 0, ymax: 1 },
      { xmin: 0, xmax: Infinity, ymin: 0, ymax: 1 },
    ]) {
      expect(parseBounds(bad)).toEqual(B);
    }
  });
});

describe('toScreen', () => {
  it('flips y, keeps one scale for both axes and centres the shorter side', () => {
    const s = toScreen({ xmin: 0, xmax: 10, ymin: 0, ymax: 5 }, 200, 200);
    expect(s.scale).toBe(20); // width limits: 200 / 10
    expect(s.sx(0)).toBe(0);
    expect(s.sx(10)).toBe(200);
    // height used is 5 * 20 = 100, centred in 200
    expect(s.sy(0)).toBe(150);
    expect(s.sy(5)).toBe(50);
    expect(s.sy(2.5)).toBe(100);
  });

  it('is exactly isometric: one world unit is the same length in x and y', () => {
    const s = toScreen({ xmin: -3, xmax: 3, ymin: -3, ymax: 9 }, 300, 100);
    expect(Math.abs(s.sx(1) - s.sx(0))).toBeCloseTo(Math.abs(s.sy(1) - s.sy(0)));
  });

  it('degenerate bounds use the default box; a zero area gives scale 0 without NaN', () => {
    expect(toScreen({ xmin: 1, xmax: 1, ymin: 0, ymax: 1 }, 100, 100).scale).toBe(10);
    const z = toScreen(B, 0, -5);
    expect(z.scale).toBe(0);
    expect(Number.isNaN(z.sx(3))).toBe(false);
  });
});

describe('clipLine', () => {
  it('extends a line to the frame edges, both ways', () => {
    const [a, b] = clipLine({ x: 4, y: 4 }, { x: 5, y: 5 }, B)!;
    expect([a, b]).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it('handles horizontal and vertical lines', () => {
    expect(clipLine({ x: 3, y: 2 }, { x: 4, y: 2 }, B)).toEqual([
      { x: 0, y: 2 },
      { x: 10, y: 2 },
    ]);
    expect(clipLine({ x: 7, y: 1 }, { x: 7, y: 9 }, B)).toEqual([
      { x: 7, y: 0 },
      { x: 7, y: 10 },
    ]);
  });

  it('clips against the near corner for a steep line leaving through the top', () => {
    const [a, b] = clipLine({ x: 5, y: 5 }, { x: 6, y: 15 }, B)!;
    expect(a.y).toBeCloseTo(0);
    expect(a.x).toBeCloseTo(4.5);
    expect(b.y).toBeCloseTo(10);
    expect(b.x).toBeCloseTo(5.5);
  });

  it('returns null when the line misses the frame, p = q, or a coordinate is not finite', () => {
    expect(clipLine({ x: 0, y: 11 }, { x: 10, y: 11 }, B)).toBeNull(); // parallel, outside
    expect(clipLine({ x: 20, y: 0 }, { x: 20, y: 5 }, B)).toBeNull();
    expect(clipLine({ x: -5, y: 20 }, { x: -4, y: 21 }, B)).toBeNull(); // diagonal, misses
    expect(clipLine({ x: 1, y: 1 }, { x: 1, y: 1 }, B)).toBeNull();
    expect(clipLine({ x: NaN, y: 1 }, { x: 2, y: 2 }, B)).toBeNull();
  });

  it('keeps a line that only touches a corner', () => {
    const seg = clipLine({ x: 10, y: 10 }, { x: 11, y: 9 }, B);
    expect(seg).not.toBeNull();
    expect(seg![0]).toEqual(seg![1]);
  });
});

describe('angleArc', () => {
  const at = { x: 100, y: 100 };

  it('draws the smaller arc between the rays and puts the label on the bisector, farther than the arc', () => {
    const arc = angleArc(at, { x: 200, y: 100 }, { x: 100, y: 0 })!; // 90° (up on screen)
    expect(arc.path).toMatch(/^M116 100A16 16 0 0 0 100 84$/); // counter-clockwise on screen
    expect(Math.hypot(arc.lx - at.x, arc.ly - at.y)).toBeCloseTo(28);
    expect(arc.lx).toBeGreaterThan(at.x);
    expect(arc.ly).toBeLessThan(at.y);
  });

  it('takes the short way round whichever order the rays are given', () => {
    const cw = angleArc(at, { x: 200, y: 100 }, { x: 100, y: 200 })!; // down on screen
    expect(cw.path).toMatch(/A16 16 0 0 1 /); // clockwise
    const ccw = angleArc(at, { x: 100, y: 200 }, { x: 200, y: 100 })!;
    expect(ccw.path).toMatch(/A16 16 0 0 0 /);
  });

  it('returns null for a zero-length ray and for collinear rays (0° and 180°)', () => {
    expect(angleArc(at, at, { x: 5, y: 5 })).toBeNull();
    expect(angleArc(at, { x: 5, y: 5 }, at)).toBeNull();
    expect(angleArc(at, { x: 200, y: 100 }, { x: 300, y: 100 })).toBeNull();
    expect(angleArc(at, { x: 200, y: 100 }, { x: 0, y: 100 })).toBeNull();
  });
});

describe('readPoints / describeGeometry', () => {
  it('drops bad ids, duplicate ids and non-finite coordinates; caps at MAX_POINTS; clips labels to 8', () => {
    const pts = readPoints([
      { id: 'A', x: 1, y: 2 },
      { id: 'A', x: 9, y: 9 },
      { id: '', x: 1, y: 1 },
      { id: 'B', x: NaN, y: 1 },
      { id: 'C', x: 3, y: 4, label: 'averyverylonglabel' },
      7,
      null,
    ]);
    expect(pts.map((p) => p.id)).toEqual(['A', 'C']);
    expect(pts[1].label).toBe('averyve…');
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, x: i, y: i }));
    expect(readPoints(many)).toHaveLength(MAX_POINTS);
    expect(readPoints('x')).toEqual([]);
  });

  it('describes objects by kind with the highlight kind, and ignores unknown kinds', () => {
    const points = readPoints([
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 1.256, y: 2 },
    ]);
    const text = describeGeometry(
      { points, segments: ['AB'], lines: [], circles: ['c1'], angles: [] },
      { A: 'active', AB: 'group-1', c1: 'bogus' },
    );
    expect(text).toBe(
      'points: A (active) (0, 0), B (1.26, 2); segments: AB (group-1); circles: c1',
    );
  });
});
