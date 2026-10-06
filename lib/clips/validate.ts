/**
 * The one way to accept clip parameters: parseInput, then entry.check (same as validateInput for
 * walkthroughs). Server tool and render script both call this, never parseInput directly.
 */
import type { ClipEntry } from '@/lib/clips/types';
import { MAX_ISSUES, parseInput } from '@/lib/tutor/input-spec';

export type ClipValidateResult<I> = { ok: true; value: I } | { ok: false; issues: string[] };

export function validateClipInput<I>(
  entry: Pick<ClipEntry<I>, 'inputSpec' | 'check'>,
  raw: unknown,
): ClipValidateResult<I> {
  const parsed = parseInput<I>(entry.inputSpec, raw);
  if (!parsed.ok) return { ok: false, issues: parsed.issues.slice(0, MAX_ISSUES) };
  if (!entry.check) return parsed;
  try {
    const issues = entry.check(parsed.value);
    if (issues.length > 0) {
      const styled = issues.map((x) => (x.includes(': ') ? x : `$: ${x}`));
      return { ok: false, issues: styled.slice(0, MAX_ISSUES) };
    }
  } catch {
    return { ok: false, issues: ['check-failed'] };
  }
  return parsed;
}
