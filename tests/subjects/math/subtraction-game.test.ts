import { describe, expect, it } from 'vitest';
import { subtractionGameEntry as entry } from '@/lib/subjects/math/catalog/subtraction-game';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { n: number; k: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const ALL: In[] = Array.from({ length: 18 }, (_, a) => a + 4).flatMap((n) =>
  [2, 3, 4, 5].map((k) => ({ n, k })),
);
const PRESETS = entry.presets.map((p) => p.input as In);
/** independent: the game searched by brute force, no modulo anywhere */
function winning(k: number, upTo: number): boolean[] {
  const win: boolean[] = [];
  for (let p = 0; p <= upTo; p++) {
    let w = false;
    for (let j = 1; j <= Math.min(k, p); j++) if (!win[p - j]) w = true;
    win.push(w);
  }
  return win;
}
const vars = (f: Frame<FigState>) => f.meta.vars as Record<string, number>;

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m4-games-invariants'],
  maxFrames: 24,
  presets: ['n10-k3', 'n12-k3', 'n7-k2', 'n20-k4'],
  beats: ['start', 'rule', 'label', 'pattern', 'strategy', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['n', 'k', 'w', 'lo', 'hi', 'p', 'j', 'tt', 'w2', 'r0', 'cur', 'mv', 'x', 'y', 'q'],
  pointers: [],
  allow: [],
  extra: ALL.slice(0, 40),
  bad: [
    { n: 3, k: 2 },
    { n: 22, k: 2 },
    { n: 10, k: 1 },
    { n: 10, k: 6 },
    { n: 10.5, k: 2 },
    { n: 10 },
    { n: 10, k: 3, z: 1 },
    null,
  ],
  predict: {
    label: { options: 2, expected: () => 0 },
    pattern: { options: 3, expected: () => 1 },
    strategy: { options: 3, expected: () => 1 },
  },
});

describe('subtraction-game: the figure is the mathematics', () => {
  it('the label frames colour each position by the brute-force result: losing (orange) iff every move reaches a winning position', () => {
    for (const i of [...ALL, ...PRESETS]) {
      const win = winning(i.k, i.n);
      const frames = gen(i).filter((f) => /^Vị trí \d+:/.test(f.meta.explanation));
      expect(frames).toHaveLength(Math.min(i.n, 2 * (i.k + 1)) + 1);
      frames.forEach((f, p) => {
        for (let q = 0; q < p; q++)
          expect(
            f.meta.highlights?.[`q${q}`],
            `${JSON.stringify(i)} frame ${p} position ${q}`,
          ).toBe(win[q] ? 'result' : 'compare');
        expect(f.meta.highlights?.[`q${p}`]).toBe('active');
        expect(f.meta.explanation, JSON.stringify(i)).toMatch(win[p] ? /THẮNG/ : /THUA/);
        if (win[p]) {
          // the winning move named in the text really leads to a losing position
          expect(win[p - vars(f).j]).toBe(false);
          expect(vars(f).j).toBeGreaterThanOrEqual(1);
          expect(vars(f).j).toBeLessThanOrEqual(i.k);
        }
      });
    }
  });

  it('the pattern frame: the losing positions are in the first column, equal to the brute-force ones', () => {
    for (const i of [...ALL, ...PRESETS]) {
      const win = winning(i.k, i.n);
      const f = gen(i).find((fr) => beatOf(fr).includes('pattern'))!;
      for (let p = 0; p <= i.n; p++) {
        expect(f.meta.highlights?.[`q${p}`], `${JSON.stringify(i)} ${p}`).toBe(
          win[p] ? 'result' : 'compare',
        );
        const pt = f.state.points.find((q) => q.id === `q${p}`)!;
        expect(pt.x === 0, `${JSON.stringify(i)} ${p}`).toBe(!win[p]);
      }
    }
  });

  it('the sample game: legal moves of 1..k sticks, ending at 0; after every move of the winner the position is losing; the winner is the first player exactly when n is a winning position', () => {
    for (const i of [...ALL, ...PRESETS]) {
      const win = winning(i.k, i.n);
      const frames = gen(i);
      const strat = frames.filter((f) => f.state.segments.some((s) => s.id.startsWith('pl')));
      expect(strat.length).toBeGreaterThanOrEqual(1);
      const full = strat.at(-1)!;
      const segs = full.state.segments.filter((s) => s.id.startsWith('pl'));
      const pos = (id: string) => Number(id.slice(1));
      let prev = i.n;
      segs.forEach((s, idx) => {
        expect(pos(s.from)).toBe(prev);
        const taken = pos(s.from) - pos(s.to);
        expect(taken, `${JSON.stringify(i)} move ${idx}`).toBeGreaterThanOrEqual(1);
        expect(taken).toBeLessThanOrEqual(i.k);
        const byWinner = full.meta.highlights?.[s.id] === 'result';
        // whoever is called the winner always leaves a losing position
        if (byWinner) expect(win[pos(s.to)]).toBe(false);
        // the first move belongs to the winner exactly when n is a winning position
        if (idx === 0) expect(byWinner).toBe(win[i.n]);
        prev = pos(s.to);
      });
      // the last frame of the game reaches 0 and the winner takes the last stick
      expect(prev).toBe(0);
      expect(full.meta.highlights?.[segs.at(-1)!.id]).toBe('result');
    }
  });

  it('the first and the last text agree with the rule: n mod (k + 1) decides, and the done text says which player wins', () => {
    for (const i of ALL) {
      const frames = gen(i);
      const done = frames.at(-1)!;
      const win = winning(i.k, i.n)[i.n];
      expect(done.meta.explanation, JSON.stringify(i)).toMatch(
        win ? /người đi trước thắng/ : /người đi trước ở vị trí thua/,
      );
      expect(vars(done).q * (i.k + 1) + vars(done).r0).toBe(i.n);
    }
  });

  it('the table has k + 1 columns and every position once; every named object exists; the frames stay within maxFrames', () => {
    for (const i of [...ALL, ...PRESETS]) {
      const frames = gen(i);
      expect(frames.length).toBeLessThanOrEqual(entry.maxFrames);
      for (const f of frames) {
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.segments.map((s) => s.id),
        ]);
        for (const key of Object.keys(f.meta.highlights ?? {}))
          expect(ids.has(key), `${JSON.stringify(i)} ${key}`).toBe(true);
        expect(f.state.points).toHaveLength(i.n + 1);
        expect(Math.max(...f.state.points.map((p) => p.x))).toBeLessThanOrEqual(i.k);
        const b = f.state.bounds;
        for (const p of f.state.points) {
          expect(p.x).toBeGreaterThanOrEqual(b.xmin);
          expect(p.x).toBeLessThanOrEqual(b.xmax);
          expect(p.y).toBeGreaterThanOrEqual(b.ymin);
          expect(p.y).toBeLessThanOrEqual(b.ymax);
        }
      }
    }
  });
});
