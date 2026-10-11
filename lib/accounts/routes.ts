import type { NextRequest } from 'next/server';

import { pendingClaimClearCookies } from '@/lib/server/identity/registry';

import { accountsPool } from './db';
import { clearSessionCookieHeader, sessionCookieHeader, sessionCookieValue } from './gate';
import {
  accountErrorResponse,
  clientAddress,
  jsonError,
  jsonResponse,
  readJsonObject,
  userAgentOf,
} from './http';
import {
  AccountError,
  changeOwnPassword,
  login,
  signOutEverywhere,
  updateAccount,
} from './service';
import { resolveSession, revokeSessionToken } from './session';

/** The one message every failed sign-in gets, so the response does not show whether the account exists. */
const INVALID_CREDENTIALS_MESSAGE = 'Tên đăng nhập hoặc mật khẩu không đúng';
const MAX_USERNAME_LENGTH = 200;
const MAX_PASSWORD_LENGTH = 1024;
const MAX_DISPLAY_NAME_LENGTH = 200;

function invalidCredentials(): Response {
  return jsonError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
}

/** `POST /api/auth/login`: a new session cookie, and the anonymous cookie (if any) dropped. */
export async function handleLogin(req: NextRequest): Promise<Response> {
  const body = await readJsonObject(req);
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return jsonError(400, 'INVALID_REQUEST', 'username and password are required');
  }
  if (body.username.length > MAX_USERNAME_LENGTH || body.password.length > MAX_PASSWORD_LENGTH) {
    return invalidCredentials();
  }
  const result = await login(await accountsPool(), {
    username: body.username,
    password: body.password,
    address: clientAddress(req.headers),
    userAgent: userAgentOf(req.headers),
    presentedToken: sessionCookieValue(req.headers),
    now: Date.now(),
  });
  if (result.outcome === 'locked') {
    const retryAfter = String(Math.ceil(result.retryAfterMs / 1000));
    return jsonError(429, 'LOCKED', INVALID_CREDENTIALS_MESSAGE, {
      headers: { 'Retry-After': retryAfter },
    });
  }
  if (result.outcome === 'invalid') return invalidCredentials();
  return jsonResponse(
    { success: true, user: result.user, mustChangePassword: result.user.mustChangePassword },
    200,
    [sessionCookieHeader(result.token), ...pendingClaimClearCookies()],
  );
}

/** `POST /api/auth/logout`: revokes the session the request names, and clears the cookie. */
export async function handleLogout(req: NextRequest): Promise<Response> {
  await revokeSessionToken(await accountsPool(), sessionCookieValue(req.headers), Date.now());
  return jsonResponse({ success: true }, 200, [clearSessionCookieHeader()]);
}

/** `GET /api/auth/me`: the signed-in account, without its password hash. */
export async function handleMe(req: NextRequest): Promise<Response> {
  const session = await resolveSession(
    await accountsPool(),
    sessionCookieValue(req.headers),
    Date.now(),
  );
  if (session.user === undefined) {
    return jsonError(401, 'UNAUTHENTICATED', 'sign in required');
  }
  return jsonResponse(
    {
      success: true,
      user: session.user,
      mustChangePassword: session.state === 'password-change',
    },
    200,
  );
}

/** `POST /api/auth/password`: the signed-in account changes its own password. */
export async function handlePassword(req: NextRequest): Promise<Response> {
  const pool = await accountsPool();
  const session = await resolveSession(pool, sessionCookieValue(req.headers), Date.now());
  if (session.user === undefined || session.sessionId === undefined) {
    return jsonError(401, 'UNAUTHENTICATED', 'sign in required');
  }
  const body = await readJsonObject(req);
  if (
    !body ||
    typeof body.currentPassword !== 'string' ||
    typeof body.newPassword !== 'string' ||
    body.currentPassword.length > MAX_PASSWORD_LENGTH ||
    body.newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    return jsonError(400, 'INVALID_REQUEST', 'currentPassword and newPassword are required');
  }
  try {
    const result = await changeOwnPassword(pool, {
      userId: session.user.id,
      sessionId: session.sessionId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      address: clientAddress(req.headers),
      now: Date.now(),
    });
    if (result.outcome === 'locked') {
      const retryAfter = String(Math.ceil(result.retryAfterMs / 1000));
      return jsonError(429, 'LOCKED', 'too many failed attempts', {
        headers: { 'Retry-After': retryAfter },
      });
    }
    // A wrong current password and a new one equal to it get this one answer (changeOwnPassword).
    if (result.outcome === 'invalid') {
      return jsonError(
        403,
        'INVALID_CREDENTIALS',
        'the current password is incorrect, or the new one matches it',
      );
    }
    return jsonResponse({ success: true }, 200);
  } catch (error) {
    if (error instanceof AccountError) {
      return jsonError(400, 'INVALID_REQUEST', 'the new password does not meet the policy', {
        reason: error.reason,
      });
    }
    throw error;
  }
}

/** `PATCH /api/auth/me`: the signed-in account changes its display name. */
export async function handleUpdateMe(req: NextRequest): Promise<Response> {
  const pool = await accountsPool();
  const session = await resolveSession(pool, sessionCookieValue(req.headers), Date.now());
  if (session.state === 'password-change') {
    return jsonError(401, 'PASSWORD_CHANGE_REQUIRED', 'the password must be changed first');
  }
  if (session.state !== 'valid' || session.user === undefined) {
    return jsonError(401, 'UNAUTHENTICATED', 'sign in required');
  }
  const body = await readJsonObject(req);
  if (
    !body ||
    typeof body.displayName !== 'string' ||
    body.displayName.length > MAX_DISPLAY_NAME_LENGTH
  ) {
    return jsonError(400, 'INVALID_REQUEST', 'displayName is required');
  }
  try {
    const user = await updateAccount(pool, {
      actorId: session.user.id,
      targetId: session.user.id,
      displayName: body.displayName,
      now: Date.now(),
    });
    return jsonResponse({ success: true, user }, 200);
  } catch (error) {
    if (error instanceof AccountError) return accountErrorResponse(error);
    throw error;
  }
}

/** `POST /api/auth/logout-all`: every session of the account ends, this device's included. */
export async function handleLogoutAll(req: NextRequest): Promise<Response> {
  const pool = await accountsPool();
  const session = await resolveSession(pool, sessionCookieValue(req.headers), Date.now());
  if (session.state !== 'valid' || session.user === undefined) {
    return jsonError(401, 'UNAUTHENTICATED', 'sign in required');
  }
  await signOutEverywhere(pool, { userId: session.user.id, now: Date.now() });
  return jsonResponse({ success: true }, 200, [clearSessionCookieHeader()]);
}
