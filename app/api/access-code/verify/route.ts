import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createAccessToken } from '@/lib/server/access-token';
import { LoginThrottle } from '@/lib/server/accounts/login-throttle';

/**
 * Failed guesses allowed per client identity inside the window. The access code
 * is a single shared secret, so without this limit it can be guessed indefinitely.
 */
const accessCodeThrottle = new LoginThrottle({
  maxFailures: 10,
  windowMs: 15 * 60 * 1000,
  maxKeys: 1000,
});

/**
 * Same rule as the render service: forwarded client addresses are honoured only
 * when the operator sets TRUST_PROXY_HEADERS=true. Otherwise every caller shares
 * one bucket, a conservative limit that a client cannot rotate its way around.
 *
 * The last entry of x-forwarded-for is the one the trusted proxy appended. A
 * client can prepend any value it likes, so the first entry is not trustworthy.
 * This assumes a single trusted proxy hop.
 */
function clientIdentity(request: Request): string {
  if (process.env.TRUST_PROXY_HEADERS !== 'true') return 'direct';
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',').pop()!.trim() || 'anonymous';
  return request.headers.get('x-real-ip')?.trim() || 'anonymous';
}

export async function POST(request: Request) {
  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    return apiSuccess({ valid: true });
  }

  const throttleKey = clientIdentity(request);
  const retryAfter = accessCodeThrottle.retryAfterSeconds(throttleKey);
  if (retryAfter !== undefined) {
    const response = apiError('RATE_LIMITED', 429, 'Too many attempts. Try again later.');
    response.headers.set('Retry-After', String(retryAfter));
    return response;
  }
  // Counted before the first await, so attempts that arrive together cannot all
  // pass the check above. A correct code clears the count below.
  accessCodeThrottle.recordFailure(throttleKey);

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
  const encoder = new TextEncoder();
  const a = encoder.encode(code);
  const b = encoder.encode(accessCode);
  if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) {
    return apiError('INVALID_REQUEST', 401, 'Invalid access code');
  }

  accessCodeThrottle.reset(throttleKey);
  const token = createAccessToken(accessCode);
  const cookieStore = await cookies();
  cookieStore.set('openmaic_access', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: process.env.NODE_ENV === 'production',
  });

  return apiSuccess({ valid: true });
}
