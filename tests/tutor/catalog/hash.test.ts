import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJSON, contentHash, framesHash, hash16 } from '@/lib/tutor/catalog/hash';

describe('canonicalJSON', () => {
  it('sorts keys recursively and keeps array order', () => {
    expect(canonicalJSON({ b: 1, a: [1, 2] })).toBe('{"a":[1,2],"b":1}');
    expect(canonicalJSON({ x: { d: 1, c: 2 } })).toBe(canonicalJSON({ x: { c: 2, d: 1 } }));
    expect(canonicalJSON([2, 1])).toBe('[2,1]');
  });
  it('turns -0 into 0', () => {
    expect(canonicalJSON(-0)).toBe('0');
    expect(canonicalJSON({ a: -0 })).toBe('{"a":0}');
  });
  it('throws TypeError on unsupported values', () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined, () => 1, Symbol('s'), BigInt(1)]) {
      expect(() => canonicalJSON(bad)).toThrow(TypeError);
    }
    expect(() => canonicalJSON({ a: undefined })).toThrow(TypeError);
  });
});

describe('hashes', () => {
  it('hash16 matches independent sha256', () => {
    const v = { b: 1, a: [1, 2] };
    const expected = createHash('sha256').update('{"a":[1,2],"b":1}').digest('hex').slice(0, 16);
    expect(hash16(v)).toBe(expected);
    expect(framesHash(v)).toBe(expected);
  });
  it('contentHash uses only preset id/input and defaults problem to null', () => {
    const base = { code: { a: 1 }, beatDefs: [1] };
    const a = contentHash({ ...base, presets: [{ id: 'p', input: 1 }] });
    const b = contentHash({
      ...base,
      presets: [{ id: 'p', input: 1, label: 'x' } as { id: string; input: number }],
      problem: undefined,
    });
    expect(a).toBe(b);
    expect(a).toBe(
      hash16({ code: { a: 1 }, beatDefs: [1], presets: [{ id: 'p', input: 1 }], problem: null }),
    );
  });
});
