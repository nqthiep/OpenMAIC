/**
 * Canonical JSON + short content hashes for catalog entries.
 * Server-side only: uses node:crypto; do not import into the iframe runtime.
 */
import { createHash } from 'node:crypto';
import type { WalkthroughEntry } from '@/lib/tutor/catalog/types';
import { steps } from '@/lib/tutor/engine/generate';

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
  // meta fields may be explicitly `undefined`; the JSON round-trip drops them (they are dropped in the HTML too).
  return hash16(JSON.parse(JSON.stringify(frames)));
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

/**
 * beatDefs as hashed: the `ask.predict.answer` function is replaced by its observable behaviour
 * (see {@link predictAnswers}), so the hash is stable and still moves when the answer logic changes.
 */
function hashableBeatDefs(beatDefs: WalkthroughEntry['beatDefs']): unknown {
  return beatDefs.map((b) => {
    if (!b.ask?.predict) return b;
    const { answer: _answer, ...predict } = b.ask.predict;
    return { ...b, ask: { ...b.ask, predict } };
  });
}

/** Per preset: the correct option index at every beat frame that has a prediction, in frame order. */
function predictAnswers(entry: WalkthroughEntry): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const withPredict = new Map(entry.beatDefs.filter((b) => b.ask?.predict).map((b) => [b.id, b]));
  for (const preset of entry.presets) {
    const frames = steps(entry, preset.input, { locale: 'en-US' });
    const list: number[] = [];
    frames.forEach((frame, i) => {
      for (const tag of frame.meta.tags ?? []) {
        const def = tag.startsWith('beat:') ? withPredict.get(tag.slice(5)) : undefined;
        if (def?.ask?.predict) list.push(def.ask.predict.answer(frame, frames[i + 1]));
      }
    });
    out[preset.id] = list;
  }
  return out;
}

/** The one place that computes an entry's contentHash (used by the provider and the catalog lock). */
export function entryContentHash(entry: WalkthroughEntry): string {
  // JSON round-trip drops `undefined` object properties (optional fields) which canonicalJSON rejects.
  return hash16(
    JSON.parse(
      JSON.stringify({
        code: entry.code,
        beatDefs: hashableBeatDefs(entry.beatDefs),
        presets: entry.presets.map((p) => ({ id: p.id, input: p.input, label: p.label })),
        problem: entry.problem ?? null,
        title: entry.title,
        pitfalls: entry.pitfalls ?? [],
        predictAnswers: predictAnswers(entry),
      }),
    ),
  );
}
