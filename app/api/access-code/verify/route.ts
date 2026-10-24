import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { ACCESS_TOKEN_MAX_AGE_SECONDS } from '@/lib/server/access-token-shared';
import { createAccessToken } from '@/lib/server/access-token';
import { accessSigningKey } from '@/lib/server/access-token-policy';
import { LoginThrottle } from '@/lib/server/accounts/login-throttle';
import { warnIfAccessCodeIsShort } from '@/lib/server/access-code-warning';
import { clientIdentity } from '@/lib/server/client-identity';
import { cookiesAreSecure } from '@/lib/server/cookie-secure';

/**
 * Failed guesses allowed per client identity inside the window. The access code
 * is a single shared secret, so without this limit it can be guessed indefinitely.
 */
const accessCodeThrottle = new LoginThrottle({
  maxFailures: 10,
  windowMs: 15 * 60 * 1000,
  maxKeys: 1000,
});

export async function POST(request: Request) {
  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    return apiSuccess({ valid: true });
  }

  warnIfAccessCodeIsShort(accessCode);
  const throttleKey = clientIdentity(request);
  const retryAfter = accessCodeThrottle.retryAfterSeconds(throttleKey);
  if (retryAfter !== undefined) {
    const response = apiError('RATE_LIMITED', 429, 'Too many attempts. Try again later.');
    response.headers.set('Retry-After', String(retryAfter));
    return response;
  }
  // Counted before the first await, so attempts that arrive together cannot all
  // pass the check above. A correct code clears the count below.
  // A refused identity gets no comparison at all: the table is full of live locks.
  if (accessCodeThrottle.recordFailure(throttleKey) === undefined) {
    const response = apiError('RATE_LIMITED', 429, 'Too many attempts. Try again later.');
    response.headers.set(
      'Retry-After',
      String(accessCodeThrottle.retryAfterSeconds(throttleKey) ?? 900),
    );
    return response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  const code =
    body !== null &&
    typeof body === 'object' &&
    typeof (body as { code?: unknown }).code === 'string'
      ? (body as { code: string }).code
      : '';

  // Constant-time comparison
  if (!code) {
    return apiError('INVALID_REQUEST', 401, 'Invalid access code');
  }

  // Constant-time comparison
  const encoder = new TextEncoder();
  const a = encoder.encode(code);
  const b = encoder.encode(accessCode);
  if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) {
    // For a trusted identity the reservation taken above already counts this
    // failure; an untrusted identity is not counted at all.
    return apiError('INVALID_REQUEST', 401, 'Invalid access code');
  }

  accessCodeThrottle.reset(throttleKey);
  const token = createAccessToken(accessSigningKey(accessCode));
  const cookieStore = await cookies();
  cookieStore.set('openmaic_access', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    // The same rule as the owner cookie: without the COOKIE_SECURE=0 opt-out
    // a plain-HTTP deployment's browser drops it and the gate never opens.
    secure: cookiesAreSecure(),
  });

  return apiSuccess({ valid: true });
}
