import { describe, expect, it } from 'vitest';
import { fibRecursionTreeEntry as entry } from '@/lib/subjects/cp/catalog/fib-recursion-tree';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { n: number; memo: 'off' | 'on' };
type S = { nodes: { id: string; label: string; parent?: string; note?: string }[] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const ALL: In[] = [0, 1, 2, 3, 4, 5, 6].flatMap((n) => [
  { n, memo: 'off' as const },
  { n, memo: 'on' as const },
]);

const fibValue = (n: number): number => {
  let [a, b] = [0, 1];
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
};
/** Calls of the plain recurrence: C(k) = 1 for k < 2, else 1 + C(k - 1) + C(k - 2). */
const plainCalls = (k: number): number => (k < 2 ? 1 : 1 + plainCalls(k - 1) + plainCalls(k - 2));
/** Calls with memo, counted independently: a call to an already-known k is a leaf. */
function memoCalls(n: number): number {
  const known = new Set<number>();
  const go = (k: number): number => {
    if (k < 2) return 1;
    if (known.has(k)) return 1;
    const c = 1 + go(k - 1) + go(k - 2);
    known.add(k);
    return c;
  };
  return go(n);
}

entryContract<In>({
  entry: entry as never,
  visualizer: 'tree',
  topics: ['t1-recursion'],
  maxFrames: 60,
  presets: ['plain-5', 'memo-5', 'base-0', 'base-1', 'memo-6'],
  beats: ['start', 'call', 'base', 'return', 'memo-hit', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['n', 'k', 'k1', 'k2', 'a', 'b', 'val', 'calls'],
  pointers: ['cur'],
  allow: [2],
  extra: ALL,
  bad: [
    { n: 7, memo: 'off' },
    { n: -1, memo: 'on' },
    { n: 3, memo: 'maybe' },
    { n: 3 },
    { memo: 'on' },
    { n: 2.5, memo: 'on' },
    { n: 3, memo: 'on', extra: 1 },
  ],
  // the next call after a call frame is always the first child f(k - 1)
  predict: { call: { options: 2, expected: () => 0 } },
});

describe('fib-recursion-tree: result and tree', () => {
  it('the value and the number of nodes match independent computations', () => {
    for (const input of ALL) {
      const frames = gen(input);
      const last = frames[frames.length - 1];
      expect(last.meta.vars?.val, JSON.stringify(input)).toBe(fibValue(input.n));
      expect(last.meta.vars?.calls, JSON.stringify(input)).toBe(
        input.memo === 'on' ? memoCalls(input.n) : plainCalls(input.n),
      );
      expect(last.state.nodes).toHaveLength(last.meta.vars!.calls as number);
    }
  });

  it('plain n = 6 has 25 calls and stays within maxFrames', () => {
    const frames = gen({ n: 6, memo: 'off' });
    expect(frames[frames.length - 1].meta.vars?.calls).toBe(25);
    expect(frames.length).toBeLessThanOrEqual(entry.maxFrames);
  });

  it('memo makes the tree linear: memo n = 6 has 11 nodes', () => {
    expect(memoCalls(6)).toBe(11);
    expect(gen({ n: 6, memo: 'on' }).at(-1)!.meta.vars?.calls).toBe(11);
  });

  it('every non-root node has an existing parent and a label f(k)', () => {
    for (const input of ALL) {
      const nodes = gen(input).at(-1)!.state.nodes;
      const ids = new Set(nodes.map((x) => x.id));
      nodes.forEach((x, i) => {
        expect(x.label).toMatch(/^f\(\d\)$/);
        if (i === 0) expect(x.parent).toBeUndefined();
        else expect(ids.has(x.parent!)).toBe(true);
      });
    }
  });

  it('every node carries its return value as a note at the end, equal to f(k)', () => {
    for (const input of ALL) {
      for (const x of gen(input).at(-1)!.state.nodes) {
        const k = Number(x.label.slice(2, -1));
        expect(x.note).toBe(`= ${fibValue(k)}`);
      }
    }
  });

  it('a node gets its note only when it returns (children first)', () => {
    const frames = gen({ n: 4, memo: 'off' });
    frames.forEach((f) => {
      if (!beatOf(f).includes('call')) return;
      const cur = (f.meta.pointers as { cur: string }).cur;
      expect(f.state.nodes.find((x) => x.id === cur)!.note).toBeUndefined();
    });
  });

  it('beats: plain has no memo-hit; memo-5 has hits and each hit node is muted', () => {
    expect(beats(gen({ n: 5, memo: 'off' }))).not.toContain('memo-hit');
    const memo = gen({ n: 5, memo: 'on' });
    expect(beats(memo)).toContain('memo-hit');
    memo.forEach((f) => {
      if (!beatOf(f).includes('memo-hit')) return;
      const cur = (f.meta.pointers as { cur: string }).cur;
      expect(f.meta.highlights?.[cur]).toBe('muted');
    });
  });

  it('n = 0 and n = 1 are a single base call', () => {
    for (const n of [0, 1]) {
      expect(beats(gen({ n, memo: 'off' }))).toEqual(['start', 'base', 'done']);
    }
  });

  it('the call stack is highlighted: ancestors stay active until they return', () => {
    const frames = gen({ n: 3, memo: 'off' });
    const deepest = frames.find((f) => beatOf(f).includes('base') && f.state.nodes.length === 3)!;
    // f(3) -> f(2) -> f(1): f(3) and f(2) are on the stack
    expect(deepest.meta.highlights?.c0).toBe('active');
    expect(deepest.meta.highlights?.c1).toBe('active');
  });

  it('the memo table (aux) lists exactly the values computed so far', () => {
    const frames = gen({ n: 5, memo: 'on' });
    const items = (f: Frame<S>) => f.meta.aux!.find((a) => a.id === 'memo')!.items;
    expect(items(frames[0])).toEqual([]);
    expect(items(frames.at(-1)!)).toEqual(['f(2) = 1', 'f(3) = 2', 'f(4) = 3', 'f(5) = 5']);
    for (const f of gen({ n: 3, memo: 'off' })) expect(f.meta.aux).toBeUndefined();
  });

  it('the call frame does not reveal the child it is about to call', () => {
    for (const input of ALL) {
      for (const f of gen(input, 'en-US')) {
        if (!beatOf(f).includes('call')) continue;
        const k = f.meta.vars!.k as number;
        expect(f.meta.explanation).not.toContain(`f(${k - 1})`);
        expect(f.meta.explanation).not.toContain(`f(${k - 2})`);
      }
    }
  });
});
