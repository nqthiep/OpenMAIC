import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { ACCESS_TOKEN_MAX_AGE_SECONDS } from '@/lib/server/access-token-shared';
import { createAccessToken } from '@/lib/server/access-token';
import { accessCodeAttemptLimiter } from '@/lib/server/attempt-limiter';
import { clientIdentity, isTrustedProxyIdentity } from '@/lib/server/client-identity';
import { warnIfAccessCodeIsShort } from '@/lib/server/access-code-warning';
import { cookiesAreSecure } from '@/lib/server/cookie-secure';

/**
 * Pull the candidate code out of an already-parsed JSON body. Anything that is
 * not `{ code: <non-empty string> }` is treated as an invalid code.
 */
function readCandidateCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const candidate = (body as { code?: unknown }).code;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

export async function POST(request: Request) {
  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    return apiSuccess({ valid: true });
  }

  // Everything down to `consume` runs synchronously, so the limiter decision and
  // the reservation happen in the same tick: a burst of concurrent requests
  // cannot all pass the window check before any of them is recorded.
  warnIfAccessCodeIsShort(accessCode);
  const trusted = isTrustedProxyIdentity();
  const identity = clientIdentity(request);
  const limit = accessCodeAttemptLimiter.consume(identity, trusted);
  if (limit.limited) {
    const response = apiError('RATE_LIMITED', 429, 'Quá nhiều lần nhập sai. Vui lòng thử lại sau.');
    response.headers.set('Retry-After', String(limit.retryAfterSeconds));
    return response;
  }

  // The reservation is taken before the body is parsed, so even a malformed body
  // consumes a slot. That is intentional.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  const candidate = readCandidateCode(body);
  if (candidate === null) {
    return apiError('INVALID_REQUEST', 401, 'Invalid access code');
  }

  // Constant-time comparison
  const encoder = new TextEncoder();
  const a = encoder.encode(candidate);
  const b = encoder.encode(accessCode);
  if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) {
    // The reservation taken above counts this failure.
    return apiError('INVALID_REQUEST', 401, 'Invalid access code');
  }

  // A correct code clears a trusted client's history. On the shared budget it
  // gives back this attempt's slot only, so successes never spend the budget.
  accessCodeAttemptLimiter.recordSuccess(identity, trusted, limit);

  const token = createAccessToken(accessCode);
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
