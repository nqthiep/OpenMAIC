/**
 * The teacher / parent gate: a second shared code, `TUTOR_TEACHER_CODE`, guarding the cross-learner
 * progress view. Same token scheme as the site access code (`openmaic_access`), keyed by this code so a
 * site-code cookie cannot be replayed here. Unset or shorter than {@link TEACHER_CODE_MIN_LENGTH}
 * means the feature is off: the routes answer 404 and the page says so.
 */
import { timingSafeEqual } from 'node:crypto';

import { verifyAccessToken } from '@/lib/server/access-token';
import { AccessCodeAttemptLimiter } from '@/lib/server/attempt-limiter';

export const TEACHER_COOKIE = 'openmaic_teacher';
export const TEACHER_CODE_MIN_LENGTH = 12;

/** Own limiter: a teacher mistyping must not spend the students' access-code budget. */
export const teacherAttemptLimiter = new AccessCodeAttemptLimiter();

export function teacherCode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const code = env.TUTOR_TEACHER_CODE;
  return code !== undefined && code.length >= TEACHER_CODE_MIN_LENGTH ? code : null;
}

export function teacherCodeMatches(candidate: string, code: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(code);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hasTeacherAccess(cookieValue: string | undefined, code: string): boolean {
  return cookieValue !== undefined && cookieValue !== '' && verifyAccessToken(cookieValue, code);
}
