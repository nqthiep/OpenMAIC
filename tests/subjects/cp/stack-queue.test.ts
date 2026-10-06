import { describe, expect, it, vi } from 'vitest';
import { stackQueueEntry as entry } from '@/lib/subjects/cp/catalog/stack-queue';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

// the exhaustive checks below are CPU heavy; a loaded CI machine needs more than the 5 s default
vi.setConfig({ testTimeout: 60_000 });

type In = { s: string };
type S = { values: string[]; mode: 'cells' };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const CHARS = ['(', ')', '[', ']', '{', '}'];

/** Independent oracle: delete adjacent matching pairs until nothing changes. */
function valid(s: string): boolean {
  let t = s;
  for (;;) {
    const u = t.replace('()', '').replace('[]', '').replace('{}', '');
    if (u === t) return t === '';
    t = u;
  }
}
function* strings(maxLen: number): Generator<In> {
  let level = [''];
  for (let len = 1; len <= maxLen; len++) {
    level = level.flatMap((p) => CHARS.map((c) => p + c));
    for (const s of level) yield { s };
  }
}
const stackOf = (f: Frame<S>): string[] =>
  (f.meta.aux!.find((a) => a.id === 'stack')!.items as string[]).slice();

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t1-stack-queue'],
  maxFrames: 30,
  presets: ['nested', 'sequence', 'mismatch', 'unclosed', 'extra-close'],
  beats: ['start', 'push', 'pop-check', 'pop', 'fail', 'done'],
  required: ['start', 'done'],
  pseudoLines: 7,
  vars: ['n', 'i', 'c', 'top', 'need', 'size'],
  pointers: ['i'],
  extra: [...strings(3), { s: '([{}])([{}])' }, { s: '(((((((((((' }, { s: '))))))))))))' }],
  bad: [
    { s: '' },
    { s: '(((((((((((((' },
    { s: 'a' },
    { s: '(a)' },
    { s: '( )' },
    { s: 5 },
    { s: '()', extra: 1 },
    {},
  ],
  predict: {
    'pop-check': {
      options: 2,
      expected: (input, frames, idx) => {
        const f = frames[idx];
        const c = input.s[(f.meta.pointers as { i: number }).i];
        const top = (f.meta.aux![0].items as string[]).at(-1);
        const need: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
        return top !== undefined && top === need[c] ? 0 : 1;
      },
    },
  },
});

describe('stack-queue: result', () => {
  it('agrees with the pair-deleting oracle on every string up to length 6', () => {
    let runs = 0;
    for (const input of strings(6)) {
      const frames = gen(input);
      const last = frames[frames.length - 1];
      expect(beatOf(last)).toEqual(['done']);
      const ok = Object.values(last.meta.highlights ?? {}).every((k) => k === 'result');
      expect(ok, input.s).toBe(valid(input.s));
      expect(beats(frames).includes('fail'), input.s).toBe(!valid(input.s));
      runs++;
    }
    expect(runs).toBeGreaterThan(50_000);
  });

  it('the stack row follows push and pop exactly (a real stack)', () => {
    for (const { s } of strings(5)) {
      const model: string[] = [];
      const frames = gen({ s });
      for (const f of frames) {
        const b = beatOf(f)[0];
        const i = (f.meta.pointers as { i?: number }).i;
        if (b === 'push') model.push(s[i!]);
        if (b === 'pop') model.pop();
        expect(stackOf(f), `${s}/${b}`).toEqual(model);
      }
    }
  });

  it('each preset ends as its name says', () => {
    const last = (id: string) => {
      const frames = gen(entry.presets.find((p) => p.id === id)!.input);
      return { frames, text: frames[frames.length - 2].meta.explanation };
    };
    expect(beats(last('mismatch').frames)).toEqual([
      'start',
      'push',
      'push',
      'pop-check',
      'fail',
      'done',
    ]);
    expect(last('mismatch').text).toMatch(/Không khớp/);
    expect(last('extra-close').text).toMatch(/Stack rỗng/);
    expect(last('unclosed').text).toMatch(/còn 2 ngoặc mở/);
    expect(beats(last('nested').frames)).not.toContain('fail');
  });

  it('the question frame (pop-check) does not announce the verdict', () => {
    for (const { s } of strings(3)) {
      for (const f of gen({ s }, 'en-US')) {
        if (!beatOf(f).includes('pop-check')) continue;
        expect(f.meta.explanation).not.toMatch(/invalid|Match:|No match/);
      }
    }
  });

  it('frames <= 2n + 3 and within maxFrames at the widest input', () => {
    for (const { s } of [...strings(4), { s: '([{}])([{}])' }]) {
      expect(gen({ s }).length).toBeLessThanOrEqual(2 * s.length + 3);
    }
    expect(gen({ s: '([{}])([{}])' }).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
