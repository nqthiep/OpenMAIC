import type { NextRequest } from 'next/server';
import type { Pool } from 'pg';

import { accountsPool } from './db';
import { sessionCookieValue } from './gate';
import { accountErrorResponse, jsonError, jsonResponse, readJsonObject } from './http';
import {
  type AccountRole,
  type AccountStatus,
  listAccounts,
  listAudit,
  type PublicUser,
} from './repository';
import { AccountError, createAccount, resetAccountPassword, updateAccount } from './service';
import { resolveSession } from './session';

/** Rows per page of the user list and of the audit log. */
const PAGE_SIZE = 50;
/** A response that carries a temporary password is never cached. */
const NO_STORE = { 'Cache-Control': 'no-store' };
const MAX_QUERY_LENGTH = 100;
const MAX_TEXT_LENGTH = 200;
const MAX_PASSWORD_LENGTH = 1024;
const MAX_USER_CURSOR_LENGTH = 64;
const AUDIT_CURSOR = /^[1-9][0-9]{0,17}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPDATABLE_FIELDS = new Set(['displayName', 'role', 'status']);

type AdminGate = { ok: true; pool: Pool; actor: PublicUser } | { ok: false; response: Response };

/**
 * The check every admin route runs first. The proxy has refused a request with
 * no session already; this checks again against the database. No session, or a
 * session that must change its password, is 401. A session of an ordinary user
 * is 403, with an error that says why.
 */
export async function requireAdmin(req: NextRequest): Promise<AdminGate> {
  const pool = await accountsPool();
  const session = await resolveSession(pool, sessionCookieValue(req.headers), Date.now());
  if (session.state === 'password-change') {
    return {
      ok: false,
      response: jsonError(401, 'PASSWORD_CHANGE_REQUIRED', 'the password must be changed first'),
    };
  }
  if (session.state !== 'valid' || session.user === undefined) {
    return { ok: false, response: jsonError(401, 'UNAUTHENTICATED', 'sign in required') };
  }
  if (session.user.role !== 'admin') {
    return { ok: false, response: jsonError(403, 'FORBIDDEN', 'administrator role required') };
  }
  return { ok: true, pool, actor: session.user };
}

function isRole(value: unknown): value is AccountRole {
  return value === 'user' || value === 'admin';
}

function isStatus(value: unknown): value is AccountStatus {
  return value === 'active' || value === 'disabled' || value === 'deleted';
}

function notFound(): Response {
  return jsonError(404, 'NOT_FOUND', 'account not found');
}

/** `GET /api/admin/users`: accounts in username order, 50 per page. `q` matches the username or the name. */
export async function handleListUsers(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const params = req.nextUrl.searchParams;
  const q = (params.get('q') ?? '').trim();
  const status = params.get('status') ?? '';
  const role = params.get('role') ?? '';
  const cursor = params.get('cursor') || undefined;
  if (
    q.length > MAX_QUERY_LENGTH ||
    (status !== '' && !isStatus(status)) ||
    (role !== '' && !isRole(role)) ||
    (cursor !== undefined && cursor.length > MAX_USER_CURSOR_LENGTH)
  ) {
    return jsonError(400, 'INVALID_REQUEST', 'the filter is not valid');
  }
  const rows = await listAccounts(gate.pool, {
    q,
    status: isStatus(status) ? status : undefined,
    role: isRole(role) ? role : undefined,
    after: cursor,
    limit: PAGE_SIZE + 1,
  });
  const users = rows.slice(0, PAGE_SIZE);
  const last = users[users.length - 1];
  return jsonResponse(
    {
      success: true,
      users,
      nextCursor: rows.length > PAGE_SIZE && last ? last.username : null,
    },
    200,
  );
}

/** `POST /api/admin/users`: a new account, which must change its password at first sign-in. Without a password, a temporary one is returned once. */
export async function handleCreateUser(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const body = await readJsonObject(req);
  if (
    !body ||
    typeof body.username !== 'string' ||
    typeof body.displayName !== 'string' ||
    !isRole(body.role) ||
    (body.password !== undefined && typeof body.password !== 'string') ||
    body.username.length > MAX_TEXT_LENGTH ||
    body.displayName.length > MAX_TEXT_LENGTH ||
    (typeof body.password === 'string' && body.password.length > MAX_PASSWORD_LENGTH)
  ) {
    return jsonError(400, 'INVALID_REQUEST', 'username, displayName and role are required');
  }
  try {
    const created = await createAccount(gate.pool, {
      actorId: gate.actor.id,
      username: body.username,
      displayName: body.displayName,
      role: body.role,
      ...(typeof body.password === 'string' ? { password: body.password } : {}),
      mustChangePassword: true,
      now: Date.now(),
    });
    return jsonResponse(
      {
        success: true,
        user: created.user,
        ...(created.temporaryPassword === undefined
          ? {}
          : { temporaryPassword: created.temporaryPassword }),
      },
      201,
      [],
      NO_STORE,
    );
  } catch (error) {
    if (error instanceof AccountError) return accountErrorResponse(error);
    throw error;
  }
}

/** `PATCH /api/admin/users/[id]`: display name, role and status. Deactivating or deleting ends the account's sessions. */
export async function handleUpdateUser(req: NextRequest, id: string): Promise<Response> {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  if (!UUID.test(id)) return notFound();
  const body = await readJsonObject(req);
  if (!body) return jsonError(400, 'INVALID_REQUEST', 'a JSON object is required');
  if (Object.keys(body).some((key) => !UPDATABLE_FIELDS.has(key))) {
    return jsonError(400, 'INVALID_REQUEST', 'only displayName, role and status can change');
  }
  const changes: { displayName?: string; role?: AccountRole; status?: AccountStatus } = {};
  if (body.displayName !== undefined) {
    if (typeof body.displayName !== 'string' || body.displayName.length > MAX_TEXT_LENGTH) {
      return jsonError(400, 'INVALID_REQUEST', 'displayName is not valid');
    }
    changes.displayName = body.displayName;
  }
  if (body.role !== undefined) {
    if (!isRole(body.role)) return jsonError(400, 'INVALID_REQUEST', 'role is not valid');
    changes.role = body.role;
  }
  if (body.status !== undefined) {
    if (!isStatus(body.status)) return jsonError(400, 'INVALID_REQUEST', 'status is not valid');
    changes.status = body.status;
  }
  if (Object.keys(changes).length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'nothing to change');
  }
  try {
    const user = await updateAccount(gate.pool, {
      actorId: gate.actor.id,
      targetId: id,
      ...changes,
      now: Date.now(),
    });
    return jsonResponse({ success: true, user }, 200);
  } catch (error) {
    if (error instanceof AccountError) return accountErrorResponse(error);
    throw error;
  }
}

/** `POST /api/admin/users/[id]/reset-password`: a new temporary password, returned once. The account's sessions end. */
export async function handleResetPassword(req: NextRequest, id: string): Promise<Response> {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  if (!UUID.test(id)) return notFound();
  try {
    const { temporaryPassword } = await resetAccountPassword(gate.pool, {
      actorId: gate.actor.id,
      targetId: id,
      now: Date.now(),
    });
    return jsonResponse({ success: true, temporaryPassword }, 200, [], NO_STORE);
  } catch (error) {
    if (error instanceof AccountError) return accountErrorResponse(error);
    throw error;
  }
}

/** `GET /api/admin/audit?cursor=`: the audit log, newest first, 50 per page. */
export async function handleAudit(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
  if (cursor !== undefined && !AUDIT_CURSOR.test(cursor)) {
    return jsonError(400, 'INVALID_REQUEST', 'cursor is not valid');
  }
  const rows = await listAudit(gate.pool, PAGE_SIZE + 1, cursor);
  const entries = rows.slice(0, PAGE_SIZE);
  const last = entries[entries.length - 1];
  return jsonResponse(
    {
      success: true,
      entries,
      nextCursor: rows.length > PAGE_SIZE && last ? last.id : null,
    },
    200,
  );
}
