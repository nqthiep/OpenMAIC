/**
 * Same-origin client for the account routes. Every failure is thrown as an
 * AccountRequestError that carries the server's error code and retry hint.
 * Neither the submitted password nor the response body is kept on the error.
 */

export interface AccountSession {
  readonly enabled: boolean;
  readonly registrationOpen: boolean;
  readonly authenticated: boolean;
  readonly account?: { readonly username: string };
}

export interface AccountCredentials {
  readonly username: string;
  readonly password: string;
}

export class AccountRequestError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string | undefined,
    readonly serverMessage: string | undefined,
    readonly retryAfterSeconds: number | undefined,
  ) {
    super(
      errorCode
        ? `Account request failed: ${errorCode}`
        : `Account request failed with HTTP ${status}`,
    );
    this.name = 'AccountRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function failureFrom(response: Response, body: unknown): AccountRequestError {
  const record = isRecord(body) ? body : {};
  const errorCode = typeof record.errorCode === 'string' ? record.errorCode : undefined;
  const serverMessage = typeof record.error === 'string' ? record.error : undefined;
  const retryAfter = Number(response.headers.get('Retry-After'));
  const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
  return new AccountRequestError(response.status, errorCode, serverMessage, retryAfterSeconds);
}

export async function fetchAccountSession(): Promise<AccountSession> {
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const body = await readJson(response);
  if (!response.ok || !isRecord(body) || body.success !== true) {
    throw failureFrom(response, body);
  }
  const account =
    isRecord(body.account) && typeof body.account.username === 'string'
      ? { username: body.account.username }
      : undefined;
  return {
    enabled: body.enabled === true,
    registrationOpen: body.registrationOpen === true,
    authenticated: body.authenticated === true,
    account,
  };
}

async function postCredentials(
  path: '/api/auth/login' | '/api/auth/register',
  credentials: AccountCredentials,
): Promise<{ username: string }> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: credentials.username, password: credentials.password }),
  });
  const body = await readJson(response);
  if (
    !response.ok ||
    !isRecord(body) ||
    body.success !== true ||
    !isRecord(body.account) ||
    typeof body.account.username !== 'string'
  ) {
    throw failureFrom(response, body);
  }
  return { username: body.account.username };
}

export function signIn(credentials: AccountCredentials): Promise<{ username: string }> {
  return postCredentials('/api/auth/login', credentials);
}

export function createAccount(credentials: AccountCredentials): Promise<{ username: string }> {
  return postCredentials('/api/auth/register', credentials);
}

export async function signOut(): Promise<void> {
  // The route takes no body. The JSON content type is still sent, as the
  // account contract requires on every request.
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await readJson(response);
  if (!response.ok || !isRecord(body) || body.success !== true) {
    throw failureFrom(response, body);
  }
}

/** Signs out every other session of this account. Resolves with how many were signed out. */
export async function signOutOtherSessions(): Promise<number> {
  const response = await fetch('/api/auth/revoke-others', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await readJson(response);
  if (!response.ok || !isRecord(body) || body.success !== true) {
    throw failureFrom(response, body);
  }
  return typeof body.revoked === 'number' ? body.revoked : 0;
}
