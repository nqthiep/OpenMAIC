/**
 * Seeded random inputs for the impl stress check (TEST-STRATEGY §2). A raw value comes from an
 * entry's InputSpec (or from the harness's own generator, for shapes a uniform draw never hits,
 * such as a tree) and must pass parseInput and the entry's check, so every case obeys the same
 * rules a student's input must obey. Not in cp/impl/: impl-equivalence globs that folder.
 */
import { parseInput, type InputSpec } from '@/lib/tutor/input-spec';

/** mulberry32: a small seeded PRNG, so a failing case reproduces from its seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [lo, hi], both ends included. */
export const intIn = (r: () => number, [lo, hi]: readonly [number, number]): number =>
  lo + Math.floor(r() * (hi - lo + 1));

const ALPHABET_CHARS = {
  'a-z': 'abcdefghijklmnopqrstuvwxyz',
  '0-9': '0123456789',
  ab: 'ab',
  brackets: '()[]{}',
} as const;

/** A raw value of the spec's shape, not yet checked: it may still break a rule (for example duplicates). */
export function randomRaw(spec: InputSpec, r: () => number): unknown {
  switch (spec.kind) {
    case 'int':
      return intIn(r, spec.range);
    case 'enum':
      return spec.values[Math.floor(r() * spec.values.length)];
    case 'int-array': {
      const len = intIn(r, spec.len);
      if (!spec.strictlyIncreasing) return Array.from({ length: len }, () => intIn(r, spec.range));
      // distinct values, sorted: the shape a strictly increasing array has
      const picked = new Set<number>();
      while (picked.size < len && picked.size < spec.range[1] - spec.range[0] + 1) {
        picked.add(intIn(r, spec.range));
      }
      return [...picked].sort((x, y) => x - y);
    }
    case 'string': {
      const chars = ALPHABET_CHARS[spec.alphabet];
      const len = intIn(r, spec.len);
      return Array.from({ length: len }, () => chars[Math.floor(r() * chars.length)]).join('');
    }
    case 'edge-list': {
      const n = intIn(r, spec.nodes);
      const m = intIn(r, spec.edges);
      const edges = Array.from({ length: m }, () => {
        const a = intIn(r, [0, n - 1]);
        const b = intIn(r, [0, n - 1]);
        return spec.weight ? [a, b, intIn(r, spec.weight)] : [a, b];
      });
      return { n, edges };
    }
    case 'grid': {
      const rows = intIn(r, spec.rows);
      const cols = intIn(r, spec.cols);
      const cellRange = spec.cell === 'bit' ? ([0, 1] as const) : (spec.range ?? ([0, 0] as const));
      return Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => intIn(r, cellRange)),
      );
    }
    case 'record': {
      const out: Record<string, unknown> = {};
      for (const [k, sub] of Object.entries(spec.fields)) out[k] = randomRaw(sub, r);
      // a search target is usually not in a uniform draw, so half the time an int field takes one of
      // the array's values (when that value is in its range): both the found and the absent path run
      const arr = Object.values(out).find(Array.isArray) as number[] | undefined;
      if (arr && arr.length > 0) {
        for (const [k, sub] of Object.entries(spec.fields)) {
          if (sub.kind !== 'int' || r() < 0.5) continue;
          const v = arr[Math.floor(r() * arr.length)];
          if (v >= sub.range[0] && v <= sub.range[1]) out[k] = v;
        }
      }
      return out;
    }
    case 'number':
      throw new Error('stress-gen: kind "number" is not used by the CP catalog');
  }
}

/** A random tree on n nodes (n - 1 edges, labels shuffled), as [a, b] pairs. */
export function randomTree(r: () => number, n: number): number[][] {
  const label = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [label[i], label[j]] = [label[j], label[i]];
  }
  return Array.from({ length: n - 1 }, (_, k) => {
    const parent = Math.floor(r() * (k + 1));
    return [label[k + 1], label[parent]];
  });
}

/** The raw value if it passes parseInput and the entry's check (returned cleaned), else null. */
export function checkedInput(
  entry: { inputSpec: InputSpec; check?: (input: never) => readonly string[] },
  raw: unknown,
): unknown {
  const parsed = parseInput<unknown>(entry.inputSpec, raw);
  if (!parsed.ok) return null;
  if (entry.check && entry.check(parsed.value as never).length > 0) return null;
  return parsed.value;
}

/** A stable seed per (entry, case): the same run always draws the same inputs. */
export function seedFor(entryId: string, index: number): number {
  let h = 0;
  for (const ch of entryId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h + index * 7919) >>> 0;
}
