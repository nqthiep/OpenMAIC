import { describe, expect, it } from 'vitest';
import { csProjectionEntry as entry } from '@/lib/subjects/math/catalog/cs-projection';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { ux: number; uy: number; vx: number; vy: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const at = (f: Frame<FigState>, id: string): [number, number] => {
  const p = f.state.points.find((q) => q.id === id)!;
  return [p.x, p.y];
};

function family(): In[] {
  const out: In[] = [];
  let x = 12345;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 300) {
    const i = { ux: next(19) - 9, uy: next(19) - 9, vx: next(19) - 9, vy: next(19) - 9 };
    if ((i.ux || i.uy) && (i.vx || i.vy)) out.push(i);
  }
  return out;
}
const FAMILY = family();

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m2-inequality-classic'],
  maxFrames: 10,
  presets: ['generic', 'parallel', 'perpendicular', 'opposite'],
  beats: ['start', 'projection', 'inequality', 'equality', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['ux', 'uy', 'vx', 'vy', 'dot', 'dot2', 'n2', 'k', 'parts', 'cross'],
  pointers: [],
  extra: [
    { ux: 9, uy: 9, vx: -9, vy: -9 },
    { ux: -9, uy: 0, vx: 0, vy: 9 },
    { ux: 1, uy: 2, vx: 2, vy: 4 },
  ],
  bad: [
    { ux: 0, uy: 0, vx: 1, vy: 1 },
    { ux: 1, uy: 1, vx: 0, vy: 0 },
    { ux: 10, uy: 1, vx: 1, vy: 1 },
    { ux: 1.5, uy: 1, vx: 1, vy: 1 },
    { ux: 1 },
    null,
  ],
  predict: {
    projection: { options: 2, expected: () => 1 },
    inequality: { options: 3, expected: () => 1 },
  },
  allow: [2, 4],
});

describe('cs-projection: the figure is the mathematics', () => {
  it('F is the orthogonal projection of v on the line of u and OF never exceeds OV', () => {
    for (const i of FAMILY) {
      const f = gen(i).find((x) => beatOf(x).includes('projection'))!;
      const [fx, fy] = at(f, 'F');
      const [vx, vy] = at(f, 'V');
      expect(Math.abs((vx - fx) * i.ux + (vy - fy) * i.uy), JSON.stringify(i)).toBeLessThan(0.03);
      expect(Math.abs(fx * i.uy - fy * i.ux)).toBeLessThan(0.03); // F is on the line of u
      expect(Math.hypot(fx, fy)).toBeLessThanOrEqual(Math.hypot(vx, vy) + 2e-3);
      expect(f.meta.vars).toEqual({ dot: i.ux * i.vx + i.uy * i.vy });
    }
  });

  it('(u.v)^2 <= |u|^2 |v|^2 with equality exactly when the cross product is 0', () => {
    for (const i of FAMILY) {
      const f = gen(i).find((x) => beatOf(x).includes('inequality'))!;
      const { dot2, n2 } = f.meta.vars as { dot2: number; n2: number };
      expect(dot2).toBeLessThanOrEqual(n2);
      const cross = i.ux * i.vy - i.uy * i.vx;
      expect(dot2 === n2, JSON.stringify(i)).toBe(cross === 0);
      // Lagrange: n2 - dot2 = cross^2
      expect(n2 - dot2).toBe(cross * cross);
    }
  });

  it('while v turns its length stays and at the end it lies on the line of u with F at its tip', () => {
    for (const i of FAMILY) {
      const frames = gen(i);
      const nv = Math.hypot(i.vx, i.vy);
      const eq = frames.find((x) => beatOf(x).includes('equality'))!;
      const turn = frames.slice(3, 7);
      expect(turn).toHaveLength(4);
      for (const f of turn) expect(Math.abs(Math.hypot(...at(f, 'V')) - nv)).toBeLessThan(3e-3);
      const [vx, vy] = at(eq, 'V');
      const [fx, fy] = at(eq, 'F');
      expect(Math.abs(vx * i.uy - vy * i.ux), JSON.stringify(i)).toBeLessThan(0.05);
      expect(Math.hypot(vx - fx, vy - fy)).toBeLessThan(2e-3);
      expect(eq.meta.vars).toEqual({ cross: i.ux * i.vy - i.uy * i.vx });
    }
  });

  it('the perpendicular preset has no triangle and the projection is the origin', () => {
    const f = gen({ ux: 1, uy: 0, vx: 0, vy: 1 }).find((x) => beatOf(x).includes('inequality'))!;
    expect(f.state.polygons).toEqual([]);
    expect(at(f, 'F')).toEqual([0, 0]);
  });
});
