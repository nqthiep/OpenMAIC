import { endAccountSession } from '@/lib/accounts/client-state';

import { messages } from './messages';

/** A failed call: the status, the server's error code, and the reason or wait it gave. */
export interface ApiFailure {
  ok: false;
  status: number;
  errorCode: string;
  reason?: string;
  retryAfterSeconds?: number;
}

export type ApiResult<T> = { ok: true; status: number; data: T } | ApiFailure;

/** One JSON call to the accounts API. Network errors are reported as `NETWORK`. */
export async function callApi<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const { method = 'GET', body } = options;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    return { ok: false, status: 0, errorCode: 'NETWORK' };
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return { ok: true, status: response.status, data: payload as T };
  const retryAfter = Number(response.headers.get('retry-after'));
  return {
    ok: false,
    status: response.status,
    errorCode: typeof payload.errorCode === 'string' ? payload.errorCode : 'UNKNOWN',
    ...(typeof payload.reason === 'string' ? { reason: payload.reason } : {}),
    ...(retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
  };
}

/** The sentence a person reads for a failed call. */
export function failureText(failure: ApiFailure): string {
  if (failure.errorCode === 'NETWORK') return messages.networkError;
  if (failure.errorCode === 'LOCKED') return messages.locked(failure.retryAfterSeconds);
  if (failure.errorCode === 'WEAK_PASSWORD') return messages.policy(failure.reason);
  if (failure.status >= 500) return messages.serverError;
  return messages.errors[failure.errorCode] ?? messages.genericError;
}

/** Ends the session on this device and goes to the sign-in page. */
export async function signOut(): Promise<void> {
  await endAccountSession({
    revoke: () => callApi('/api/auth/logout', { method: 'POST' }),
    leave: () => window.location.assign('/login'),
  });
}
