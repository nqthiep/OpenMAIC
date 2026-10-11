/**
 * The teacher / parent gate: a second shared code, `TUTOR_TEACHER_CODE`, guarding the cross-learner
 * progress view.
 *
 * The cookie `openmaic_teacher` is HMAC-signed with `accessSigningKey(code)`: the teacher code
 * joined with `OPENMAIC_ACCESS_SECRET` when that is set. A site access cookie cannot be replayed
 * here, and the reverse holds.
 * Unset, shorter than {@link TEACHER_CODE_MIN_LENGTH}, or equal to the site signing key, the feature
 * is off: the routes answer 403 and the page says it is not open.
 */
import { timingSafeEqual } from 'node:crypto';

import { createKeyedAccessToken, verifyKeyedAccessToken } from '@/lib/server/access-token';
import { accessSigningKey } from '@/lib/server/access-token-edge';
import { AccessCodeAttemptLimiter } from '@/lib/server/attempt-limiter';

export const TEACHER_COOKIE = 'openmaic_teacher';
export const TEACHER_CODE_MIN_LENGTH = 16;

/**
 * Without a trusted proxy, every teacher attempt shares one budget of this many
 * failures per window. Coarse on purpose: the cost of an attacker spending it is
 * a short wait for the teacher, not access for a student.
 * ponytail: the budget is per process, so N replicas allow N budgets; move it to a
 * shared store if the teacher gate runs on several instances.
 */
export const TEACHER_UNTRUSTED_MAX_FAILURES = 10;
export const TEACHER_UNTRUSTED_WINDOW_MS = 15 * 60_000;

/** Own limiter: a teacher mistyping must not spend the students' access-code budget. */
export const teacherAttemptLimiter = new AccessCodeAttemptLimiter({
  untrustedBudget: {
    maxFailures: TEACHER_UNTRUSTED_MAX_FAILURES,
    windowMs: TEACHER_UNTRUSTED_WINDOW_MS,
  },
});

export function teacherCode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const code = env.TUTOR_TEACHER_CODE;
  if (code === undefined || [...code].length < TEACHER_CODE_MIN_LENGTH) return null;
  // A teacher code that signs like the site code would let a site cookie verify as a teacher cookie.
  const siteKey = accessSigningKey(env.ACCESS_CODE ?? '', env);
  if (code === siteKey || accessSigningKey(code, env) === siteKey) return null;
  return code;
}

export function teacherCodeMatches(candidate: string, code: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(code);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The `openmaic_teacher` cookie value for a teacher who entered `code`. */
export function createTeacherToken(code: string): string {
  return createKeyedAccessToken(accessSigningKey(code));
}

export function hasTeacherAccess(cookieValue: string | undefined, code: string): boolean {
  return (
    cookieValue !== undefined &&
    cookieValue !== '' &&
    verifyKeyedAccessToken(cookieValue, accessSigningKey(code))
  );
}
