/**
 * Cache key of a rendered clip (DATA-MODEL §4): sha256 of the canonical JSON of
 * [1, templateId, templateRev, paramsCanon, localeOrNull, profile, imageDigest].
 * Parameters are quantised to the `step` of their InputSpec first, so 0.30000000004 and 0.3 match.
 * Server-side only: uses node:crypto.
 */
import { createHash } from 'node:crypto';
import { canonicalJSON } from '@/lib/tutor/catalog/hash';
import type { InputSpec } from '@/lib/tutor/input-spec';

export interface ClipCacheKeyParts {
  templateId: string;
  templateRev: number;
  params: unknown;
  spec: InputSpec;
  locale: string;
  bakedText: boolean;
  profile: string;
  imageDigest: string;
}

const KEY_VERSION = 1;

/** Quantise every `number` kind to its step (relative to range[0]); other kinds pass through. */
export function quantise(spec: InputSpec, value: unknown): unknown {
  switch (spec.kind) {
    case 'number': {
      if (typeof value !== 'number') return value;
      const q = Math.round((value - spec.range[0]) / spec.step);
      // integer step multiples keep the result exact: q * step has at most the step's decimals
      const decimals = (String(spec.step).split('.')[1] ?? '').length;
      return Number((spec.range[0] + q * spec.step).toFixed(decimals));
    }
    case 'record': {
      if (typeof value !== 'object' || value === null) return value;
      const o = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(o).map((k) => [k, k in spec.fields ? quantise(spec.fields[k], o[k]) : o[k]]),
      );
    }
    default:
      return value;
  }
}

export function clipCacheKey(p: ClipCacheKeyParts): string {
  const paramsCanon = quantise(p.spec, p.params);
  const localeOrNull = p.bakedText ? p.locale : null;
  const body = canonicalJSON([
    KEY_VERSION,
    p.templateId,
    p.templateRev,
    paramsCanon,
    localeOrNull,
    p.profile,
    p.imageDigest,
  ]);
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}
