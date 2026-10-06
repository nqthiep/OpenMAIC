import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { binarySearchEntry } from '@/lib/subjects/cp/catalog/binary-search';
import { canonicalJSON, entryContentHash, framesHash, hash16 } from '@/lib/tutor/catalog/hash';
import type { WalkthroughEntry } from '@/lib/tutor/catalog/types';

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
  it('framesHash drops undefined fields but refuses non-finite numbers', () => {
    expect(framesHash([{ a: 1, b: undefined }])).toBe(framesHash([{ a: 1 }]));
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => framesHash([{ state: { values: [1, bad] } }])).toThrow(TypeError);
    }
  });
});

describe('entryContentHash', () => {
  it('is memoised per entry object and keeps its value', () => {
    const entry = binarySearchEntry as WalkthroughEntry;
    const first = entryContentHash(entry);
    expect(first).toMatch(/^[0-9a-f]{16}$/);
    let runs = 0;
    const counting: WalkthroughEntry = {
      ...entry,
      run: (i, emit, tick, ctx) => {
        runs++;
        entry.run(i, emit, tick, ctx);
      },
    };
    const h = entryContentHash(counting);
    const after = runs;
    expect(after).toBeGreaterThan(0);
    expect(entryContentHash(counting)).toBe(h);
    expect(runs).toBe(after);
    // a copy is a different object but the same content
    expect(entryContentHash({ ...counting })).toBe(h);
  });
});
