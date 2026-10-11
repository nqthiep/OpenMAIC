/**
 * POST /api/teacher/login { code } — exchange the teacher code for the `openmaic_teacher` cookie.
 *
 * 403 while `TUTOR_TEACHER_CODE` is unset or unusable (checked before any attempt is counted),
 * 400 for a malformed body, 401 for a wrong code, 429 with `Retry-After` once the failure budget is spent.
 */
import { cookies } from 'next/headers';

import { ACCESS_TOKEN_MAX_AGE_SECONDS } from '@/lib/server/access-token-shared';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { clientIdentity, isTrustedProxyIdentity } from '@/lib/server/client-identity';
import { cookiesAreSecure } from '@/lib/server/cookie-secure';
import {
  TEACHER_COOKIE,
  createTeacherToken,
  teacherAttemptLimiter,
  teacherCode,
  teacherCodeMatches,
} from '@/lib/server/teacher-gate';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const code = teacherCode();
  if (!code) return apiError('INVALID_REQUEST', 403, 'Teacher code is not set on the server');

  const trusted = isTrustedProxyIdentity();
  const identity = clientIdentity(request);
  const limit = teacherAttemptLimiter.consume(identity, trusted);
  if (limit.limited) {
    const response = apiError('RATE_LIMITED', 429, 'Too many attempts');
    response.headers.set('Retry-After', String(limit.retryAfterSeconds));
    return response;
  }

  let candidate: unknown;
  try {
    candidate = ((await request.json()) as { code?: unknown } | null)?.code;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }
  if (typeof candidate !== 'string') {
    return apiError('INVALID_REQUEST', 400, 'Teacher code required');
  }
  if (!teacherCodeMatches(candidate, code)) {
    return apiError('INVALID_REQUEST', 401, 'Invalid teacher code');
  }

  teacherAttemptLimiter.recordSuccess(identity, trusted);
  (await cookies()).set(TEACHER_COOKIE, createTeacherToken(code), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    secure: cookiesAreSecure(),
  });
  return apiSuccess({ valid: true });
}
