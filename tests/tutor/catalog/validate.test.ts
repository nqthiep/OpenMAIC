import { describe, expect, expectTypeOf, it } from 'vitest';
import type { WalkthroughEntry } from '@/lib/tutor/catalog/types';
import { validateInput } from '@/lib/tutor/catalog/validate';
import type { StepSource } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';

interface In {
  l: number;
  r: number;
}
const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    l: { kind: 'int', range: [0, 9] },
    r: { kind: 'int', range: [0, 9] },
  },
};

describe('validateInput', () => {
  it('without check: passes what parseInput passes', () => {
    expect(validateInput<In>({ inputSpec }, { l: 1, r: 2 })).toEqual({
      ok: true,
      value: { l: 1, r: 2 },
    });
  });

  it('returns parseInput issues and never runs check on a bad shape', () => {
    let called = 0;
    const check = () => {
      called++;
      return [];
    };
    const res = validateInput<In>({ inputSpec, check }, { l: 1 });
    expect(res).toEqual({ ok: false, issues: ['r: missing'] });
    expect(called).toBe(0);
  });

  it('runs check after parseInput on the cleaned value', () => {
    const seen: unknown[] = [];
    const check = (v: Readonly<In>) => {
      seen.push(v);
      return v.l <= v.r ? [] : ['l-gt-r'];
    };
    expect(validateInput<In>({ inputSpec, check }, { l: 1, r: 2 }).ok).toBe(true);
    expect(validateInput<In>({ inputSpec, check }, { l: 3, r: 2 })).toEqual({
      ok: false,
      issues: ['$: l-gt-r'],
    });
    expect(seen).toEqual([
      { l: 1, r: 2 },
      { l: 3, r: 2 },
    ]);
  });

  it('caps check issues at 5', () => {
    const check = () => ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const res = validateInput<In>({ inputSpec, check }, { l: 1, r: 2 });
    expect(res).toEqual({
      ok: false,
      issues: ['$: a', '$: b', '$: c', '$: d', '$: e'],
    });
  });

  it('keeps check issues that already have a path: reason shape', () => {
    const check = () => ['l: too-big', 'plain'];
    expect(validateInput<In>({ inputSpec, check }, { l: 1, r: 2 })).toEqual({
      ok: false,
      issues: ['l: too-big', '$: plain'],
    });
  });

  it('maps a throwing check to check-failed', () => {
    const check = () => {
      throw new Error('boom');
    };
    expect(validateInput<In>({ inputSpec, check }, { l: 1, r: 2 })).toEqual({
      ok: false,
      issues: ['check-failed'],
    });
  });

  it('rejects oversized and non-JSON input like parseInput', () => {
    expect(validateInput<In>({ inputSpec }, BigInt(1))).toEqual({
      ok: false,
      issues: ['not-json'],
    });
    expect(
      validateInput(
        { inputSpec: { kind: 'string', len: [0, 5000], alphabet: 'a-z' } },
        'a'.repeat(3000),
      ),
    ).toEqual({
      ok: false,
      issues: ['too-large'],
    });
  });
});

describe('WalkthroughEntry', () => {
  it('is assignable to the engine StepSource', () => {
    expectTypeOf<WalkthroughEntry<In, number>>().toMatchTypeOf<StepSource<In, number>>();
  });
});
