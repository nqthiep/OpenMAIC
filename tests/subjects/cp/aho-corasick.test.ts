import { describe, expect, it } from 'vitest';
import { ahoCorasickEntry as entry } from '@/lib/subjects/cp/catalog/aho-corasick';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { p1: string; p2: string; text: string };
type S = {
  nodes: { id: string; label: string; parent?: string; edgeLabel?: string; note?: string }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const matchesOf = (f: Frame<S>): string[] =>
  f.meta.aux!.find((a) => a.id === 'matches')!.items as string[];
/** Independent oracle: naive search, "k@end" for each occurrence of pattern k. */
function naive({ p1, p2, text }: In): string[] {
  const out: string[] = [];
  [p1, p2].forEach((p, k) => {
    for (let i = 0; i + p.length <= text.length; i++)
      if (text.startsWith(p, i)) out.push(`${k + 1}@${i + p.length - 1}`);
  });
  return out.sort();
}
function* words(max: number): Generator<string> {
  let level = [''];
  for (let len = 1; len <= max; len++) {
    level = level.flatMap((w) => ['a', 'b'].map((c) => w + c));
    yield* level;
  }
}
const FAMILY: In[] = [];
for (const p1 of words(3))
  for (const p2 of words(2))
    for (const text of ['abab', 'aaaa', 'abba', 'bbbbab', 'aabbaabba', 'abababab'])
      FAMILY.push({ p1, p2, text });
const PRESETS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'tree',
  topics: ['t4-string-advanced'],
  maxFrames: 60,
  presets: ['classic', 'nested', 'none', 'same'],
  beats: ['start', 'insert', 'fail-link', 'scan', 'output', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: [
    'p1',
    'p2',
    'text',
    'k',
    'p',
    'nodes',
    'x',
    'y',
    'rootfail',
    'i',
    'c',
    'from',
    'to',
    'count',
    'n',
  ],
  pointers: ['state'],
  allow: [0],
  extra: FAMILY.filter((_, k) => k % 37 === 0),
  bad: [
    { p1: '', p2: 'a', text: 'a' },
    { p1: 'abab', p2: 'a', text: 'a' },
    { p1: 'a', p2: 'a', text: '' },
    { p1: 'a', p2: 'a', text: 'abababababa' },
    { p1: 'c', p2: 'a', text: 'a' },
    { p1: 'a', p2: 'A', text: 'a' },
    { p1: 'a', p2: 'a', text: 'a', extra: 1 },
    { p1: 'a', p2: 'a' },
  ],
  predict: {
    'fail-link': {
      options: 2,
      expected: (_input, frames, idx) => {
        const f = frames[idx] as Frame<S>;
        const x = (f.meta.vars as { x: string }).x;
        // independent: a depth-1 node (or any node without a proper suffix in the trie) fails to the root
        const labels = new Set(f.state.nodes.map((n) => n.label));
        for (let cut = 1; cut < x.length; cut++) if (labels.has(x.slice(cut))) return 1;
        return 0;
      },
    },
  },
});

describe('aho-corasick: result', () => {
  it('every occurrence is found exactly once (naive oracle, both patterns, all positions)', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const last = gen(input).at(-1)!;
      expect([...matchesOf(last)].sort(), JSON.stringify(input)).toEqual(naive(input));
    }
  });

  it('every failure link points to the longest proper suffix that is a trie node', () => {
    for (const input of FAMILY.filter((_, k) => k % 11 === 0)) {
      const frames = gen(input);
      const f = [...frames].reverse().find((x) => x.state.nodes.some((n) => n.note))!;
      const labels = new Set(f.state.nodes.map((n) => n.label));
      for (const node of f.state.nodes) {
        if (!node.note) continue;
        const target = node.note.slice('fail→'.length);
        let want = 'ε';
        for (let cut = 1; cut < node.label.length; cut++)
          if (labels.has(node.label.slice(cut))) {
            want = node.label.slice(cut);
            break;
          }
        expect(target, `${JSON.stringify(input)} ${node.label}`).toBe(want);
      }
    }
  });

  it('the trie merges shared prefixes; terminal nodes are highlighted result', () => {
    const f = gen({ p1: 'ab', p2: 'aa', text: 'a' }).find(
      (x) => beatOf(x).includes('insert') && x.meta.vars!.k === 2,
    )!;
    expect(f.state.nodes.map((n) => n.label)).toEqual(['ε', 'a', 'ab', 'aa']);
    expect(Object.values(f.meta.highlights ?? {})).toContain('result');
  });

  it('same patterns are both reported (two outputs per occurrence)', () => {
    const last = gen(PRESETS[3]).at(-1)!;
    expect([...matchesOf(last)].sort()).toEqual(['1@1', '2@1']);
  });

  it('the fail-link question appears for the first two nodes only', () => {
    for (const input of FAMILY.slice(0, 60)) {
      expect(
        gen(input)
          .flatMap(beatOf)
          .filter((b) => b === 'fail-link').length,
      ).toBeLessThanOrEqual(2);
    }
  });

  it('every input fits maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
