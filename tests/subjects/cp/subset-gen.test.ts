import { describe, expect, it } from 'vitest';
import { subsetGenEntry as entry } from '@/lib/subjects/cp/catalog/subset-gen';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { items: number[] };
type TreeNode = { id: string; label: string; parent?: string; edgeLabel?: string };
type S = { nodes: TreeNode[] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const out = (f: Frame<S>): string[] => f.meta.aux!.find((a) => a.id === 'out')!.items as string[];

/** Independent oracle: one subset per bit mask, in the order the take-first recursion produces. */
function expectedOrder(items: readonly number[]): string[] {
  const n = items.length;
  const res: string[] = [];
  for (let mask = (1 << n) - 1; mask >= 0; mask--) {
    // item 0 is the most significant decision: taken first
    res.push(`{${items.filter((_, k) => mask & (1 << (n - 1 - k))).join(',')}}`);
  }
  return res;
}

const ALL: In[] = [
  { items: [1] },
  { items: [9, 9] },
  { items: [1, 2, 3] },
  { items: [4, 7] },
  { items: [3, 1, 2, 3] },
  { items: [1, 2, 3, 4] },
  { items: [9, 8, 7, 6] },
];

entryContract<In>({
  entry: entry as never,
  visualizer: 'tree',
  topics: ['t2-brute-force'],
  maxFrames: 80,
  presets: ['n3', 'n1', 'n2', 'n4'],
  beats: ['start', 'choose', 'skip', 'leaf', 'backtrack', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['n', 'i', 'ai', 'set', 'count'],
  pointers: ['cur'],
  allow: [2],
  extra: ALL,
  bad: [
    { items: [] },
    { items: [1, 2, 3, 4, 5] },
    { items: [0] },
    { items: [10] },
    { items: [1.5] },
    { items: [1], extra: 1 },
    {},
  ],
  // the take branch always runs first
  predict: { choose: { options: 2, expected: () => 0 } },
});

describe('subset-gen: result and tree', () => {
  it('the leaves list exactly the 2^n subsets, in take-first order', () => {
    for (const input of ALL) {
      const frames = gen(input);
      const last = frames[frames.length - 1];
      expect(out(last), JSON.stringify(input)).toEqual(expectedOrder(input.items));
      expect(last.meta.vars?.count).toBe(2 ** input.items.length);
    }
  });

  it('the tree has 2^(n+1) - 1 nodes (31 for n = 4) and 2^n leaves', () => {
    for (const input of ALL) {
      const n = input.items.length;
      const last = gen(input).at(-1)!;
      expect(last.state.nodes).toHaveLength(2 ** (n + 1) - 1);
      expect(beats(gen(input)).filter((b) => b === 'leaf')).toHaveLength(2 ** n);
    }
    expect(gen({ items: [1, 2, 3, 4] }).at(-1)!.state.nodes).toHaveLength(31);
  });

  it('every node but the root has a parent and a take/skip edge label of its depth', () => {
    for (const input of ALL) {
      const nodes = gen(input, 'en-US').at(-1)!.state.nodes;
      const byId = new Map(nodes.map((x) => [x.id, x]));
      const depth = (id: string): number =>
        byId.get(id)!.parent ? 1 + depth(byId.get(id)!.parent!) : 0;
      nodes.forEach((x, k) => {
        if (k === 0) {
          expect(x.parent).toBeUndefined();
          expect(x.edgeLabel).toBeUndefined();
          return;
        }
        expect(byId.has(x.parent!)).toBe(true);
        expect(x.edgeLabel).toMatch(new RegExp(`^(take|skip) a\\[${depth(x.id) - 1}\\]$`));
      });
    }
  });

  it('a node label is the set of items taken on the path from the root', () => {
    for (const input of ALL) {
      const nodes = gen(input).at(-1)!.state.nodes;
      const byId = new Map(nodes.map((x) => [x.id, x]));
      for (const x of nodes) {
        const taken: number[] = [];
        for (let cur: TreeNode | undefined = x; cur?.parent; cur = byId.get(cur.parent)) {
          const i = Number(/a\[(\d+)\]/.exec(cur.edgeLabel!)![1]);
          if (cur.edgeLabel!.startsWith('lấy')) taken.unshift(input.items[i]);
        }
        expect(x.label).toBe(`{${taken.join(',')}}`);
      }
    }
  });

  it('beat order: skip frames follow a backtrack; every internal node chooses once', () => {
    for (const input of ALL) {
      const seq = beats(gen(input));
      const n = input.items.length;
      seq.forEach((b, k) => {
        if (b === 'backtrack') expect(seq[k + 1]).toBe('skip');
      });
      expect(seq.filter((b) => b === 'choose')).toHaveLength(2 ** n - 1);
      expect(seq.filter((b) => b === 'backtrack')).toHaveLength(2 ** n - 1);
      expect(seq.filter((b) => b === 'skip')).toHaveLength(2 ** n - 1);
    }
  });

  it('frame counts: n = 4 has 63 frames, within maxFrames', () => {
    expect(gen({ items: [1, 2, 3, 4] })).toHaveLength(63);
  });

  it('the recorded list only grows, one subset per leaf frame', () => {
    const frames = gen({ items: [1, 2, 3] });
    frames.forEach((f, k) => {
      if (k === 0) return;
      const grew = out(f).length - out(frames[k - 1]).length;
      expect(grew).toBe(beatOf(f).includes('leaf') ? 1 : 0);
    });
  });

  it('the choose frame (the question) does not name the branch it will take', () => {
    for (const f of gen({ items: [1, 2, 3] }, 'en-US')) {
      if (beatOf(f).includes('choose'))
        expect(f.meta.explanation).not.toMatch(/take branch|skip branch/);
    }
  });
});
