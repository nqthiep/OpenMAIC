/**
 * The ready-made preset closest to some parameters (task 3C-08): when an on-demand render fails, the agent is told which
 * pre-rendered variant to use instead. Distance is the sum over the parameters of the relative difference (a number is
 * divided by the width of its range; a choice or a text counts 0 when equal and 1 when not); the first preset wins a tie.
 */
import type { AnyClipEntry } from '@/lib/clips/types';
import type { InputSpec } from '@/lib/tutor/input-spec';

export function paramDistance(spec: InputSpec, a: unknown, b: unknown): number {
  switch (spec.kind) {
    case 'int':
    case 'number': {
      if (typeof a !== 'number' || typeof b !== 'number') return 1;
      const width = spec.range[1] - spec.range[0];
      return width > 0 ? Math.abs(a - b) / width : a === b ? 0 : 1;
    }
    case 'int-array': {
      if (!Array.isArray(a) || !Array.isArray(b)) return 1;
      const width = spec.range[1] - spec.range[0] || 1;
      const n = Math.max(a.length, b.length);
      let d = 0;
      for (let i = 0; i < n; i++) {
        d +=
          typeof a[i] === 'number' && typeof b[i] === 'number' ? Math.abs(a[i] - b[i]) / width : 1;
      }
      return d;
    }
    case 'record': {
      if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return 1;
      const x = a as Record<string, unknown>;
      const y = b as Record<string, unknown>;
      return Object.entries(spec.fields).reduce((s, [k, f]) => s + paramDistance(f, x[k], y[k]), 0);
    }
    default:
      return JSON.stringify(a) === JSON.stringify(b) ? 0 : 1;
  }
}

/** The preset of `entry` nearest to `params`, or null when the entry has none. */
export function nearestPreset(
  entry: AnyClipEntry,
  params: unknown,
): { id: string; distance: number } | null {
  let best: { id: string; distance: number } | null = null;
  for (const p of entry.presets) {
    const distance = paramDistance(entry.inputSpec, params, p.input);
    if (best === null || distance < best.distance) best = { id: p.id, distance };
  }
  return best;
}
