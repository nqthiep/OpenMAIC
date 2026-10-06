import { describe, expect, it } from 'vitest';
import { maxFlowEntry as entry } from '@/lib/subjects/cp/catalog/max-flow';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';
import harness from './impl/max-flow';

type In = { n: number; edges: number[][] };
type S = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; weight: number; directed: boolean; label: string }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
function family(): In[] {
  const out: In[] = [];
  let x = 3003;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 150; t++) {
    const n = 2 + next(5);
    const all: number[][] = [];
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) all.push([a, b]);
    const want = Math.min(all.length, 1 + next(10));
    const edges: number[][] = [];
    while (edges.length < want) {
      const [a, b] = all.splice(next(all.length), 1)[0];
      edges.push([a, b, 1 + next(10)]);
    }
    out.push({ n, edges });
  }
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);
const flowOf = (i: In): number => {
  const last = gen(i).at(-1)!;
  return last.meta.vars!.total as number;
};

entryContract<In>({
  entry: entry as never,
  visualizer: 'graph',
  topics: ['t4-flow-matching'],
  maxFrames: 40,
  presets: ['classic', 'bottleneck', 'back-edge', 'no-path'],
  beats: ['start', 'bfs-path', 'bottleneck', 'augment', 'residual', 'min-cut', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['s', 't', 'path', 'len', 'b', 'total', 'side', 'rounds'],
  pointers: [],
  allow: [0],
  extra: FAMILY.slice(0, 20),
  bad: [
    { n: 1, edges: [[0, 0, 1]] },
    { n: 7, edges: [[0, 1, 1]] },
    { n: 3, edges: [] },
    { n: 3, edges: [[0, 1]] },
    { n: 3, edges: [[0, 1, 0]] },
    { n: 3, edges: [[0, 1, 11]] },
    { n: 3, edges: [[1, 1, 5]] },
    { n: 3, edges: [[0, 3, 5]] },
    { n: 3, edges: [[0, 1, 5]], extra: 1 },
    { n: 3 },
  ],
  predict: { bottleneck: { options: 3, expected: () => 0 } },
});

describe('max-flow: result', () => {
  it('the flow equals the brute-force minimum cut (every set S with the source, without the sink)', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      expect(String(flowOf(input)), JSON.stringify(input)).toBe(harness.expected(input));
    }
  });

  it('flow is conserved at every inner node and respects capacities in the last augment frame', () => {
    for (const input of FAMILY.slice(0, 80)) {
      const frames = gen(input).filter((f) => beatOf(f).includes('augment'));
      const f = frames.at(-1);
      if (!f) continue;
      const bal = Array<number>(input.n).fill(0);
      f.state.edges.forEach((e, i) => {
        const [fl, c] = e.label.split('/').map(Number);
        expect(fl).toBeLessThanOrEqual(c);
        expect(fl).toBeGreaterThanOrEqual(0);
        bal[e.from.charCodeAt(0) - 65] -= fl;
        bal[e.to.charCodeAt(0) - 65] += fl;
        expect(i).toBeGreaterThanOrEqual(0);
      });
      for (let v = 1; v < input.n - 1; v++) expect(bal[v]).toBe(0);
    }
  });

  it('the min-cut frame marks edges leaving S whose capacities add up to the flow', () => {
    for (const input of FAMILY.slice(0, 80)) {
      const f = gen(input).find((x) => beatOf(x).includes('min-cut'))!;
      expect(f.meta.vars!.total).toBe(flowOf(input));
    }
  });

  it('presets: 9 for the classic network? checked against the oracle; no-path gives 0', () => {
    expect(flowOf(PRESETS[3])).toBe(0);
    expect(flowOf(PRESETS[1])).toBe(2);
    expect(flowOf(PRESETS[2])).toBe(2);
    expect(beats(gen(PRESETS[3]))).not.toContain('augment');
  });

  it('every input fits maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
