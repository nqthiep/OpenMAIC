import { describe, expect, it } from 'vitest';
import { parseInput, type InputSpec } from '@/lib/tutor/input-spec';

const bad = (spec: InputSpec, raw: unknown) => {
  const r = parseInput(spec, raw);
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.issues;
};
const good = (spec: InputSpec, raw: unknown) => {
  const r = parseInput<unknown>(spec, raw);
  expect(r.ok).toBe(true);
  return r.ok ? r.value : undefined;
};

describe('int', () => {
  const s: InputSpec = { kind: 'int', range: [1, 8] };
  it('accepts bounds', () => {
    expect(good(s, 1)).toBe(1);
    expect(good(s, 8)).toBe(8);
  });
  it('rejects', () => {
    expect(bad(s, 0)).toEqual(['$: out-of-range']);
    expect(bad(s, 9)).toEqual(['$: out-of-range']);
    expect(bad(s, 2.5)).toEqual(['$: not-int']);
    expect(bad(s, '3')).toEqual(['$: not-int']);
  });
});

describe('number', () => {
  const s: InputSpec = { kind: 'number', range: [0.5, 2], step: 0.25 };
  it('accepts multiples of step from range[0]', () => {
    expect(good(s, 0.5)).toBe(0.5);
    expect(good(s, 1.25)).toBe(1.25);
    expect(good(s, 2)).toBe(2);
  });
  it('rejects off-step, out of range, non-finite', () => {
    expect(bad(s, 0.6)).toEqual(['$: not-on-step']);
    expect(bad(s, 2.25)).toEqual(['$: out-of-range']);
    expect(bad(s, 0.25)).toEqual(['$: out-of-range']);
    expect(bad(s, NaN)).toEqual(['$: not-number']);
    expect(bad(s, '1')).toEqual(['$: not-number']);
  });
  it('tolerates 1e-9 error', () => {
    expect(good({ kind: 'number', range: [0, 1], step: 0.1 }, 0.3)).toBe(0.3);
  });
});

describe('enum', () => {
  const s: InputSpec = { kind: 'enum', values: ['sin', 'cos', 3] };
  it('strict equality', () => {
    expect(good(s, 'sin')).toBe('sin');
    expect(good(s, 3)).toBe(3);
    expect(bad(s, '3')).toEqual(['$: not-in-enum']);
    expect(bad(s, 'tan')).toEqual(['$: not-in-enum']);
  });
});

describe('int-array', () => {
  const s: InputSpec = { kind: 'int-array', len: [1, 4], range: [0, 9] };
  it('valid and copy', () => {
    const raw = [3, 1, 3];
    const v = good(s, raw) as number[];
    expect(v).toEqual(raw);
    expect(v).not.toBe(raw);
  });
  it('length and element errors', () => {
    expect(bad(s, [])).toEqual(['$: bad-length']);
    expect(bad(s, [1, 2, 3, 4, 5])).toEqual(['$: bad-length']);
    expect(bad(s, [1, 10])).toEqual(['$[1]: out-of-range']);
    expect(bad(s, [1, 1.5])).toEqual(['$[1]: not-int']);
    expect(bad(s, 'x')).toEqual(['$: not-array']);
  });
  it('strictlyIncreasing', () => {
    const st: InputSpec = { ...s, strictlyIncreasing: true } as InputSpec;
    expect(good(st, [1, 2, 9])).toEqual([1, 2, 9]);
    expect(bad(st, [1, 2, 2])).toEqual(['$[2]: not-increasing']);
    expect(bad(st, [3, 2])).toEqual(['$[1]: not-increasing']);
  });
  it('caps issues at 5', () => {
    const big: InputSpec = { kind: 'int-array', len: [0, 50], range: [0, 1] };
    expect(bad(big, Array(30).fill(7))).toHaveLength(5);
  });
});

describe('string', () => {
  const s: InputSpec = { kind: 'string', len: [1, 4], alphabet: 'ab' };
  it('works', () => {
    expect(good(s, 'abba')).toBe('abba');
    expect(bad(s, '')).toEqual(['$: bad-length']);
    expect(bad(s, 'abbab')).toEqual(['$: bad-length']);
    expect(bad(s, 'abc')).toEqual(['$: bad-char']);
    expect(bad(s, 5)).toEqual(['$: not-string']);
    expect(good({ kind: 'string', len: [0, 3], alphabet: '0-9' }, '042')).toBe('042');
    expect(bad({ kind: 'string', len: [0, 3], alphabet: 'a-z' }, 'aB')).toEqual(['$: bad-char']);
  });
});

describe('edge-list', () => {
  const s: InputSpec = { kind: 'edge-list', nodes: [2, 5], edges: [0, 4] };
  const w: InputSpec = { ...s, weight: [1, 9] } as InputSpec;
  it('valid', () => {
    expect(
      good(s, {
        n: 3,
        edges: [
          [0, 1],
          [2, 1],
        ],
      }),
    ).toEqual({
      n: 3,
      edges: [
        [0, 1],
        [2, 1],
      ],
    });
    expect(good(w, { n: 3, edges: [[0, 1, 9]] })).toEqual({ n: 3, edges: [[0, 1, 9]] });
    expect(good(s, { n: 2, edges: [] })).toEqual({ n: 2, edges: [] });
  });
  it('invalid', () => {
    expect(bad(s, { n: 1, edges: [] })).toEqual(['$.n: out-of-range']);
    expect(bad(s, { n: 3, edges: [[0, 3]] })).toEqual(['$.edges[0][1]: bad-node']);
    expect(bad(s, { n: 3, edges: [[1, 1]] })).toEqual(['$.edges[0]: self-loop']);
    expect(bad(s, { n: 3, edges: [[0, 1, 2]] })).toEqual(['$.edges[0]: bad-edge-shape']);
    expect(bad(w, { n: 3, edges: [[0, 1]] })).toEqual(['$.edges[0]: bad-edge-shape']);
    expect(bad(w, { n: 3, edges: [[0, 1, 10]] })).toEqual(['$.edges[0][2]: out-of-range']);
    expect(bad(s, { n: 3, edges: Array(5).fill([0, 1]) })).toEqual(['$.edges: bad-length']);
    expect(bad(s, { n: 3 })).toEqual(['$.edges: missing']);
    expect(bad(s, { n: 3, edges: [], x: 1 })).toEqual(['$.x: unknown-key']);
    expect(bad(s, [])).toEqual(['$: not-object']);
  });
});

describe('grid', () => {
  const bit: InputSpec = { kind: 'grid', rows: [1, 3], cols: [1, 3], cell: 'bit' };
  const int: InputSpec = { kind: 'grid', rows: [1, 2], cols: [2, 2], cell: 'int', range: [-2, 2] };
  it('valid', () => {
    expect(
      good(bit, [
        [0, 1],
        [1, 0],
      ]),
    ).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(good(int, [[-2, 2]])).toEqual([[-2, 2]]);
  });
  it('invalid', () => {
    expect(bad(bit, [])).toEqual(['$: bad-rows']);
    expect(bad(bit, [[0, 1], [1]])).toEqual(['$[1]: ragged']);
    expect(bad(bit, [[0, 2]])).toEqual(['$[0][1]: not-bit']);
    expect(bad(bit, [[0, 0, 0, 0]])).toEqual(['$: bad-cols']);
    expect(bad(int, [[0, 3]])).toEqual(['$[0][1]: out-of-range']);
    expect(bad(bit, [1])).toEqual(['$[0]: not-array']);
  });
});

describe('record', () => {
  const s: InputSpec = {
    kind: 'record',
    fields: {
      n: { kind: 'int', range: [1, 5] },
      xs: { kind: 'int-array', len: [1, 3], range: [0, 9] },
    },
  };
  it('valid', () => {
    expect(good(s, { n: 2, xs: [1, 2] })).toEqual({ n: 2, xs: [1, 2] });
  });
  it('missing, unknown, nested', () => {
    expect(bad(s, { n: 2 })).toEqual(['xs: missing']);
    expect(bad(s, { n: 2, xs: [1], z: 1 })).toEqual(['z: unknown-key']);
    expect(bad(s, { n: 9, xs: [1, 20] })).toEqual(['n: out-of-range', 'xs[1]: out-of-range']);
    expect(bad(s, [1])).toEqual(['$: not-object']);
    expect(bad(s, new Date(0))).toEqual(['$: not-object']);
  });
  it('rejects __proto__ key as unknown', () => {
    const raw = JSON.parse('{"n":1,"xs":[1],"__proto__":{"a":1}}');
    expect(bad(s, raw)).toEqual(['__proto__: unknown-key']);
  });
});

describe('size and odd inputs', () => {
  it('too-large', () => {
    const s: InputSpec = { kind: 'string', len: [0, 5000], alphabet: 'a-z' };
    expect(good(s, 'a'.repeat(2046))).toHaveLength(2046);
    expect(bad(s, 'a'.repeat(2047))).toEqual(['too-large']);
  });
  it('counts UTF-8 bytes', () => {
    const s: InputSpec = { kind: 'enum', values: [] };
    expect(bad(s, 'é'.repeat(1030))).toEqual(['too-large']);
  });
  it('never throws on odd values', () => {
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    const specs: InputSpec[] = [
      { kind: 'int', range: [0, 1] },
      { kind: 'record', fields: { a: { kind: 'int', range: [0, 1] } } },
      { kind: 'grid', rows: [0, 2], cols: [0, 2], cell: 'bit' },
    ];
    for (const sp of specs)
      for (const v of [null, undefined, () => 1, cyc, Symbol('x'), BigInt(10), NaN, Infinity]) {
        expect(() => parseInput(sp, v)).not.toThrow();
        expect(parseInput(sp, v).ok).toBe(false);
      }
    expect(bad(specs[0], cyc)).toEqual(['not-json']);
    expect(bad(specs[0], undefined)).toEqual(['not-json']);
    expect(bad(specs[0], () => 1)).toEqual(['not-json']);
  });
  it('throwing getters do not throw', () => {
    const evil = {
      get a(): number {
        throw new Error('x');
      },
    };
    expect(() => parseInput({ kind: 'record', fields: {} }, evil)).not.toThrow();
  });
});
