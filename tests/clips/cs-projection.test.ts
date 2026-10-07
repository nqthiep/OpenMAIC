import { describe, expect, it } from 'vitest';
import csProjection, {
  csProjectionEntry as entry,
  expectedDisplay,
} from '@/lib/subjects/math/clips/cs-projection';
import { validateClipInput } from '@/lib/clips/validate';
import { clipContract } from './clip-contract';

type In = { ux: number; uy: number; vx: number; vy: number };

const sweep: In[] = [];
for (let ux = -9; ux <= 9; ux += 3)
  for (let uy = -9; uy <= 9; uy += 3)
    for (let vx = -9; vx <= 9; vx += 3)
      for (let vy = -9; vy <= 9; vy += 3) {
        if ((ux || uy) && (vx || vy)) sweep.push({ ux, uy, vx, vy });
      }
for (let t = 1; t <= 9; t++)
  sweep.push({ ux: t, uy: 2 * t > 9 ? 9 : 2 * t, vx: -t, vy: 2 * t > 9 ? -9 : -2 * t }); // parallel, opposite

clipContract<In>({
  module: csProjection,
  presets: ['generic', 'parallel', 'perpendicular', 'opposite'],
  chapters: [
    { id: 'vectors', range: [8, 12] },
    { id: 'projection', range: [10, 15] },
    { id: 'inequality', range: [10, 15] },
    { id: 'equality', range: [8, 12] },
  ],
  bad: [
    { ux: 0, uy: 0, vx: 1, vy: 1 },
    { ux: 1, uy: 1, vx: 0, vy: 0 },
    { ux: 10, uy: 0, vx: 1, vy: 1 },
    { ux: -10, uy: 0, vx: 1, vy: 1 },
    { ux: 1, uy: 1.5, vx: 1, vy: 1 },
    { ux: 1, uy: 1, vx: 1 },
    { ux: 1, uy: 1, vx: 1, vy: 1, w: 2 },
    { ux: '1', uy: 1, vx: 1, vy: 1 },
    null,
  ],
  edges: [
    { ux: 9, uy: 9, vx: 9, vy: 9 },
    { ux: -9, uy: -9, vx: 9, vy: 9 },
    { ux: 9, uy: -9, vx: -9, vy: 9 },
    { ux: 1, uy: 0, vx: 0, vy: -9 },
    { ux: 0, uy: 1, vx: 9, vy: 0 },
  ],
  // independent: lengths from Pythagoras, the projection from |v|·|cos| with cos from the dot product
  display: ({ ux, uy, vx, vy }) => {
    const nu = Math.hypot(ux, uy);
    const nv = Math.hypot(vx, vy);
    const dot = ux * vx + uy * vy;
    const r = (x: number) => Math.round(x * 1000) / 1000;
    return { dot, normU: r(nu), normV: r(nv), proj: r(nv * Math.abs(dot / (nu * nv))) };
  },
  sweep,
});

describe('cs-projection: specifics', () => {
  it('presets: the numbers from the card', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { dot: 5, normU: 3.162, normV: 2.236, proj: 1.581 },
      { dot: 10, normU: 2.236, normV: 4.472, proj: 4.472 },
      { dot: 0, normU: 1, normV: 1, proj: 0 },
      { dot: -4, normU: 1.414, normV: 2.828, proj: 2.828 },
    ]);
  });

  it('the projection never exceeds |v|, and equals it exactly for parallel and opposite vectors (unrounded values)', () => {
    for (let ux = -9; ux <= 9; ux++)
      for (let uy = -9; uy <= 9; uy++)
        for (const [vx, vy] of [
          [1, 2],
          [-3, 5],
          [4, 4],
          [9, -1],
          [0, 7],
        ]) {
          if (!ux && !uy) continue;
          const proj = Math.abs(ux * vx + uy * vy) / Math.hypot(ux, uy);
          const nv = Math.hypot(vx, vy);
          expect(proj).toBeLessThanOrEqual(nv + 1e-9);
          expect(Math.abs(proj - nv) < 1e-9).toBe(ux * vy - uy * vx === 0);
          // the manifest value is the same number rounded to 3 decimals
          expect(expectedDisplay({ ux, uy, vx, vy }).proj).toBe(Math.round(proj * 1000) / 1000);
        }
  });

  it('the presets cover equality (parallel, opposite) and strictness (generic, perpendicular)', () => {
    const gaps = entry.presets.map((p) => {
      const d = expectedDisplay(p.input);
      return d.normV - d.proj;
    });
    expect(gaps[1]).toBe(0);
    expect(gaps[3]).toBe(0);
    expect(gaps[0]).toBeGreaterThan(0.5);
    expect(gaps[2]).toBe(1); // perpendicular: the projection is 0, the gap is the whole of |v| = 1
  });

  it('only integer vectors can be asked for: no string field', () => {
    expect(JSON.stringify(entry.inputSpec)).not.toContain('"string"');
    expect(validateClipInput(entry, { ux: 1, uy: '\\input{x}', vx: 1, vy: 1 }).ok).toBe(false);
  });

  it('check names which vector is zero', () => {
    expect(entry.check!({ ux: 0, uy: 0, vx: 1, vy: 1 })).toEqual(['u-is-zero']);
    expect(entry.check!({ ux: 0, uy: 0, vx: 0, vy: 0 })).toEqual(['u-is-zero', 'v-is-zero']);
  });
});
