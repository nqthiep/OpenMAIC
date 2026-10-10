/**
 * POST /api/teacher/login { code } — exchange the teacher code for the `openmaic_teacher` cookie.
 * 404 while `TUTOR_TEACHER_CODE` is unset or too short (the feature is off, fail closed).
 */
import { cookies } from 'next/headers';

import { createAccessToken } from '@/lib/server/access-token';
import { ACCESS_TOKEN_MAX_AGE_SECONDS } from '@/lib/server/access-token-shared';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { clientIdentity, isTrustedProxyIdentity } from '@/lib/server/client-identity';
import { cookiesAreSecure } from '@/lib/server/cookie-secure';
import {
  TEACHER_COOKIE,
  teacherAttemptLimiter,
  teacherCode,
  teacherCodeMatches,
} from '@/lib/server/teacher-gate';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const code = teacherCode();
  if (!code) return new Response('Not found', { status: 404 });

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
    candidate = ((await request.json()) as { code?: unknown }).code;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }
  if (typeof candidate !== 'string' || !teacherCodeMatches(candidate, code)) {
    return apiError('INVALID_REQUEST', 401, 'Invalid teacher code');
  }

  teacherAttemptLimiter.recordSuccess(identity, trusted);
  (await cookies()).set(TEACHER_COOKIE, createAccessToken(code), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    secure: cookiesAreSecure(),
  });
  return apiSuccess({ valid: true });
}
