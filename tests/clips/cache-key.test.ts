import { describe, expect, it } from 'vitest';
import { clipCacheKey, quantise, type ClipCacheKeyParts } from '@/lib/clips/cache-key';
import { validateClipInput } from '@/lib/clips/validate';
import type { InputSpec } from '@/lib/tutor/input-spec';

const spec: InputSpec = {
  kind: 'record',
  fields: {
    a: { kind: 'number', range: [0, 10], step: 0.1 },
    mode: { kind: 'enum', values: ['x', 'y'] },
  },
};
const base: ClipCacheKeyParts = {
  templateId: 'amgm-semicircle',
  templateRev: 1,
  params: { a: 0.3, mode: 'x' },
  spec,
  locale: 'vi-VN',
  bakedText: true,
  profile: '720p30',
  imageDigest: 'sha256:aaa',
};

describe('clipCacheKey', () => {
  it('has the sha256: prefix and 64 hex digits', () => {
    expect(clipCacheKey(base)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('does not depend on the key order of params', () => {
    expect(clipCacheKey({ ...base, params: { mode: 'x', a: 0.3 } })).toBe(clipCacheKey(base));
  });

  it('quantises numbers to the step: 0.30000000004 equals 0.3', () => {
    expect(clipCacheKey({ ...base, params: { a: 0.30000000004, mode: 'x' } })).toBe(
      clipCacheKey(base),
    );
    expect(clipCacheKey({ ...base, params: { a: 0.4, mode: 'x' } })).not.toBe(clipCacheKey(base));
    expect(quantise(spec, { a: 0.1 + 0.2, mode: 'y' })).toEqual({ a: 0.3, mode: 'y' });
  });

  it('changes with imageDigest, templateRev, templateId, profile and params', () => {
    const k = clipCacheKey(base);
    for (const patch of [
      { imageDigest: 'sha256:bbb' },
      { templateRev: 2 },
      { templateId: 'other' },
      { profile: '1080p60' },
      { params: { a: 0.3, mode: 'y' } },
    ]) {
      expect(clipCacheKey({ ...base, ...patch })).not.toBe(k);
    }
  });

  it('locale matters only when the text is baked in', () => {
    expect(clipCacheKey({ ...base, locale: 'en-US' })).not.toBe(clipCacheKey(base));
    const silent = { ...base, bakedText: false };
    expect(clipCacheKey({ ...silent, locale: 'en-US' })).toBe(
      clipCacheKey({ ...silent, locale: 'vi-VN' }),
    );
  });
});

describe('validateClipInput', () => {
  const entry = {
    inputSpec: spec,
    check: (i: { a: number }) => (i.a > 5 ? ['a-too-big'] : []),
  };
  it('accepts a good input and rejects shape, range and check errors', () => {
    expect(validateClipInput(entry, { a: 0.3, mode: 'x' }).ok).toBe(true);
    expect(validateClipInput(entry, { a: 11, mode: 'x' }).ok).toBe(false);
    expect(validateClipInput(entry, { a: 0.3, mode: 'z' }).ok).toBe(false);
    const r = validateClipInput(entry, { a: 6, mode: 'x' });
    expect(r).toEqual({ ok: false, issues: ['$: a-too-big'] });
  });

  it('a check that throws becomes check-failed', () => {
    const bad = {
      inputSpec: spec,
      check: () => {
        throw new Error('boom');
      },
    };
    expect(validateClipInput(bad, { a: 1, mode: 'x' })).toEqual({
      ok: false,
      issues: ['check-failed'],
    });
  });
});
