import { describe, expect, it } from 'vitest';
import { grahamScanEntry as entry } from '@/lib/subjects/cp/catalog/graham-scan';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';
import { hullVertices } from './impl/graham-scan';

type In = { pts: number[][] };
type S = {
  bounds: { xmin: number; xmax: number; ymin: number; ymax: number };
  points: { id: string; x: number; y: number; label: string }[];
  segments: { id: string; from: string; to: string; dashed?: boolean }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const key = (p: number[]): string => `${p[0]},${p[1]}`;

function family(): In[] {
  const out: In[] = [];
  let x = 2026;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 200; t++) {
    const n = 3 + next(6);
    const seen = new Set<string>();
    const pts: number[][] = [];
    const span = 1 + next(9); // small spans make many collinear points
    while (pts.length < n) {
      const p = [next(2 * span + 1) - span, next(2 * span + 1) - span];
      if (!seen.has(key(p))) {
        seen.add(key(p));
        pts.push(p);
      }
      if (seen.size >= (2 * span + 1) ** 2) break;
    }
    if (pts.length >= 3) out.push({ pts });
  }
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);

/** the vertex set shown by the last frame: the stack points marked `result` */
function shownHull(input: In): string[] {
  const last = gen(input).at(-1)!;
  return Object.entries(last.meta.highlights ?? {})
    .filter(([k, h]) => /^P\d+$/.test(k) && h === 'result')
    .map(([k]) => key(input.pts[Number(k.slice(1))]))
    .sort();
}

const turnExpected = (_input: In, frames: readonly Frame<unknown>[], i: number): number =>
  beatOf(frames[i + 1]).includes('pop') ? 1 : 0;

entryContract<In>({
  entry: entry as never,
  visualizer: 'geometry',
  topics: ['t4-geometry'],
  maxFrames: 50,
  presets: ['classic', 'collinear', 'triangle', 'square-inside'],
  beats: ['start', 'pivot', 'sort-angle', 'turn', 'pop', 'done'],
  required: ['start', 'done'],
  pseudoLines: 7,
  vars: ['n', 'k', 'x', 'y', 'a', 'b', 'p', 'cross', 'h'],
  pointers: [],
  allow: [1],
  extra: FAMILY.slice(0, 30),
  bad: [
    {
      pts: [
        [0, 0],
        [1, 1],
      ],
    },
    { pts: Array.from({ length: 9 }, (_, i) => [i, i]) },
    { pts: [[0, 0], [1, 1], [2]] },
    {
      pts: [
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
      ],
    },
    {
      pts: [
        [0, 0],
        [1, 1],
        [10, 2],
      ],
    },
    {
      pts: [
        [0, 0],
        [1, 1],
        [-10, 2],
      ],
    },
    {
      pts: [
        [0, 0],
        [1, 1],
        [0.5, 2],
      ],
    },
    {
      pts: [
        [0, 0],
        [1, 1],
        [0, 0],
      ],
    },
    {
      pts: [
        [0, 0],
        [1, 1],
        [2, 5],
      ],
      extra: 1,
    },
    { pts: 'abc' },
  ],
  predict: { turn: { options: 2, expected: turnExpected } },
});

describe('graham-scan: result', () => {
  it('the hull shown at the end equals the per-pair oracle on every input', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const want = hullVertices(input.pts).map(key).sort();
      expect(shownHull(input), JSON.stringify(input)).toEqual(want);
      expect(gen(input).at(-1)!.meta.vars?.h).toBe(want.length);
    }
  });

  it('the hull is convex: the cross product at every vertex turns left (CCW order from the pivot)', () => {
    for (const input of FAMILY) {
      const last = gen(input).at(-1)!;
      const edges = last.state.segments.map((s) => [s.from, s.to]);
      const h = last.meta.vars!.h as number;
      if (h < 3) continue;
      expect(edges).toHaveLength(h); // h - 1 stack edges plus the closing edge
      const at = (id: string) => input.pts[Number(id.slice(1))];
      for (let i = 0; i < edges.length; i++) {
        const a = at(edges[i][0]);
        const b = at(edges[i][1]);
        const c = at(edges[(i + 1) % edges.length][1]);
        const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        expect(cr).toBeGreaterThan(0);
      }
    }
  });

  it('the pivot is the lowest point (leftmost if tied) and is marked active', () => {
    for (const input of FAMILY.slice(0, 60)) {
      const pivot = gen(input).find((f) => beatOf(f).includes('pivot'))!;
      const k = pivot.meta.vars!.k as number;
      for (const p of input.pts) {
        expect(
          p[1] > input.pts[k][1] || (p[1] === input.pts[k][1] && p[0] >= input.pts[k][0]),
        ).toBe(true);
      }
      expect(pivot.meta.highlights?.[`P${k}`]).toBe('active');
    }
  });

  it('a pop happens exactly when the turn is not a left turn, and the popped point stays muted', () => {
    for (const input of FAMILY.slice(0, 100)) {
      const frames = gen(input);
      frames.forEach((f, i) => {
        if (!beatOf(f).includes('pop')) return;
        const v = f.meta.vars as { cross: number; b: number };
        expect(v.cross).toBeLessThanOrEqual(0);
        const after = frames
          .slice(i + 1)
          .find((g) => g.meta.highlights?.[`P${v.b}`] !== undefined)!;
        expect(after.meta.highlights?.[`P${v.b}`]).toBe('muted');
      });
    }
  });

  it('the last stack in aux has as many points as the hull', () => {
    for (const input of FAMILY.slice(0, 80)) {
      const last = gen(input).at(-1)!;
      expect(last.meta.aux!.find((a) => a.id === 'stack')!.items).toHaveLength(
        last.meta.vars!.h as number,
      );
    }
  });

  it('collinear preset: the middle point on the edge is popped and is not a vertex', () => {
    const frames = gen(PRESETS[1]);
    expect(beats(frames)).toContain('pop');
    expect(shownHull(PRESETS[1])).toEqual(['-4,-3', '-4,3', '4,-3', '4,3'].sort());
  });

  it('presets: hull sizes 5, 4, 3, 4 vertices of the points', () => {
    expect(PRESETS.map((p) => gen(p).at(-1)!.meta.vars!.h)).toEqual(
      PRESETS.map((p) => hullVertices(p.pts).length),
    );
    expect(PRESETS.slice(1).map((p) => gen(p).at(-1)!.meta.vars!.h)).toEqual([4, 3, 4]);
  });

  it('the turn frame hides the verdict; all-collinear input ends with two vertices', () => {
    for (const f of gen(PRESETS[0], 'en-US'))
      if (beatOf(f).includes('turn')) expect(f.meta.explanation).not.toMatch(/cross product is/);
    const line: In = {
      pts: [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
      ],
    };
    expect(gen(line).at(-1)!.meta.vars!.h).toBe(2);
    expect(shownHull(line)).toEqual(['0,0', '3,3']);
  });

  it('frame counts stay within maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
