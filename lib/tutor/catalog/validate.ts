/**
 * The only way to accept input for a catalog entry: parseInput, then entry.check.
 * Tool, iframe and describe paths all call this, never parseInput directly.
 */
import type { WalkthroughEntry } from '@/lib/tutor/catalog/types';
import { MAX_ISSUES, parseInput } from '@/lib/tutor/input-spec';

export type ValidateResult<I> = { ok: true; value: I } | { ok: false; issues: string[] };

export function validateInput<I>(
  entry: Pick<WalkthroughEntry<I>, 'inputSpec' | 'check'>,
  raw: unknown,
): ValidateResult<I> {
  const parsed = parseInput<I>(entry.inputSpec, raw);
  if (!parsed.ok) return { ok: false, issues: parsed.issues.slice(0, MAX_ISSUES) };
  if (!entry.check) return parsed;
  try {
    const issues = entry.check(parsed.value);
    if (issues.length > 0) return { ok: false, issues: issues.slice(0, MAX_ISSUES) };
  } catch {
    return { ok: false, issues: ['check-failed'] };
  }
  return parsed;
}
