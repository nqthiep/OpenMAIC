/**
 * Canonical JSON + short content hashes for catalog entries.
 * Server-side only: uses node:crypto; do not import into the iframe runtime.
 */
import { createHash } from 'node:crypto';

export function canonicalJSON(v: unknown): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return JSON.stringify(v);
    case 'number':
      if (!Number.isFinite(v)) throw new TypeError(`canonicalJSON: non-finite number ${v}`);
      return Object.is(v, -0) ? '0' : JSON.stringify(v);
    case 'object': {
      if (Array.isArray(v)) return `[${v.map((x) => canonicalJSON(x)).join(',')}]`;
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(o[k])}`).join(',')}}`;
    }
    default:
      throw new TypeError(`canonicalJSON: unsupported type ${typeof v}`);
  }
}

export function hash16(v: unknown): string {
  return createHash('sha256').update(canonicalJSON(v)).digest('hex').slice(0, 16);
}

export function framesHash(frames: unknown): string {
  return hash16(frames);
}

export function contentHash(args: {
  code: unknown;
  beatDefs: unknown;
  presets: ReadonlyArray<{ id: string; input: unknown }>;
  problem?: unknown;
}): string {
  const { code, beatDefs, presets, problem } = args;
  return hash16({
    code,
    beatDefs,
    presets: presets.map((p) => ({ id: p.id, input: p.input })),
    problem: problem ?? null,
  });
}
