/**
 * POST /api/teacher/logout — clear the `openmaic_teacher` cookie.
 *
 * The cookie is set with the same attributes as at login (path, HttpOnly, SameSite, Secure), so the
 * browser replaces the stored cookie instead of keeping a second one.
 */
import { cookies } from 'next/headers';

import { apiSuccess } from '@/lib/server/api-response';
import { cookiesAreSecure } from '@/lib/server/cookie-secure';
import { TEACHER_COOKIE } from '@/lib/server/teacher-gate';

export const runtime = 'nodejs';

export async function POST() {
  (await cookies()).set(TEACHER_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: cookiesAreSecure(),
  });
  return apiSuccess({ valid: false });
}
