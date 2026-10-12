/**
 * Request handling for the account administration routes. Each route checks the
 * caller's role first (see policy.ts), and every change or read is written to the
 * audit table with the caller's account id.
 */
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { can, type Viewer } from '@/lib/server/authz/policy';
import { administratorUsernames, effectiveRole, isAccountRole } from '@/lib/server/authz/roles';

import { requireAdministrator, requireStaff } from './admin';
import {
  accountsNotConfigured,
  crossSiteRefusal,
  isCrossSiteRequest,
  readJsonObject,
  runAccountRoute,
} from './http';
import { accountServiceDeps, accountsEnabled } from './runtime';
import {
  findAccountRoleById,
  listAccounts,
  recordAdminRead,
  setAccountDisabled,
  setAccountRole,
} from './store';

/** Account ids are random UUIDs (see insertAccount in service.ts). */
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MAX_LENGTH = 200;
const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;

function parsePageLimit(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return PAGE_DEFAULT;
  return Math.min(value, PAGE_MAX);
}

/** The optional `reason` of an account action: text of at most 200 characters, or undefined. */
function readReason(
  body: Record<string, unknown>,
): { ok: true; reason?: string } | { ok: false; response: Response } {
  const reason = body.reason;
  if (
    reason !== undefined &&
    (typeof reason !== 'string' || Array.from(reason).length > REASON_MAX_LENGTH)
  ) {
    return {
      ok: false,
      response: apiError(
        'INVALID_REQUEST',
        400,
        `reason must be text of at most ${REASON_MAX_LENGTH} characters`,
      ),
    };
  }
  return { ok: true, reason: typeof reason === 'string' ? reason : undefined };
}

function viewerOf(staff: { accountId: string; role: Viewer['role'] }): Viewer {
  return { accountId: staff.accountId, role: staff.role };
}

/** One page of accounts, with no password material. Each page read is audited. */
export async function handleListAccounts(request: Request): Promise<Response> {
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    const staff = await requireStaff(request.headers);
    if (staff instanceof Response) return staff;

    const url = new URL(request.url);
    const limit = parsePageLimit(url.searchParams.get('limit'));
    const after = url.searchParams.get('after') ?? undefined;
    if (after !== undefined && !ACCOUNT_ID_PATTERN.test(after)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid page cursor');
    }

    const deps = await accountServiceDeps();
    await recordAdminRead(deps.db, {
      actorId: staff.accountId,
      action: 'list',
      reason: after === undefined ? undefined : `after=${after}`,
      now: new Date(),
    });
    const rows = await listAccounts(deps.db, after, limit + 1);
    const admins = administratorUsernames();
    const page = rows.slice(0, limit).map((row) => ({
      ...row,
      role: admins.has(row.username) ? 'admin' : row.role,
    }));
    const nextAfter = rows.length > limit ? page[page.length - 1]!.id : null;
    return apiSuccess({ accounts: page, nextAfter });
  });
}

/**
 * Disables or enables one account. An operator can act on learners and operators, but
 * only an administrator can act on an administrator. Nobody disables their own account,
 * so the last administrator cannot lock everyone out from the API.
 */
export async function handleAccountDisabledChange(
  request: Request,
  accountId: string,
  disable: boolean,
): Promise<Response> {
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    if (isCrossSiteRequest(request)) return crossSiteRefusal();
    const staff = await requireStaff(request.headers);
    if (staff instanceof Response) return staff;
    if (!ACCOUNT_ID_PATTERN.test(accountId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid account id');
    }

    const body = await readJsonObject(request);
    if (!body.ok) return body.response;
    const reason = readReason(body.body);
    if (!reason.ok) return reason.response;
    if (disable && accountId === staff.accountId) {
      return apiError('INVALID_REQUEST', 400, 'An administrator cannot disable their own account');
    }

    const deps = await accountServiceDeps();
    const target = await findAccountRoleById(deps.db, accountId);
    if (!target) return apiError('INVALID_REQUEST', 404, 'Account not found');
    const targetRole = effectiveRole(target.username, target.role);
    if (!can(viewerOf(staff), 'accounts.disable', { targetRole })) {
      return apiError('ADMIN_ONLY', 403, 'Only an administrator can change an administrator.');
    }

    const changed = await setAccountDisabled(deps.db, {
      actorId: staff.accountId,
      targetId: accountId,
      disable,
      reason: reason.reason,
      now: new Date(),
    });
    if (!changed) return apiError('INVALID_REQUEST', 404, 'Account not found');
    return apiSuccess({ id: accountId, disabled: disable });
  });
}

/**
 * Sets the stored role of one account. Only an administrator does this. An account listed
 * in ADMIN_USERNAMES always stays administrator, so it cannot be changed here.
 */
export async function handleAccountRoleChange(
  request: Request,
  accountId: string,
): Promise<Response> {
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    if (isCrossSiteRequest(request)) return crossSiteRefusal();
    const admin = await requireAdministrator(request.headers);
    if (admin instanceof Response) return admin;
    if (!ACCOUNT_ID_PATTERN.test(accountId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid account id');
    }

    const body = await readJsonObject(request);
    if (!body.ok) return body.response;
    const role = body.body.role;
    if (!isAccountRole(role)) {
      return apiError('INVALID_REQUEST', 400, 'role must be learner, operator or admin');
    }
    const reason = readReason(body.body);
    if (!reason.ok) return reason.response;
    if (accountId === admin.accountId) {
      return apiError('INVALID_REQUEST', 400, 'An administrator cannot change their own role');
    }

    const deps = await accountServiceDeps();
    const target = await findAccountRoleById(deps.db, accountId);
    if (!target) return apiError('INVALID_REQUEST', 404, 'Account not found');
    if (administratorUsernames().has(target.username)) {
      return apiError(
        'ENVIRONMENT_ADMIN',
        409,
        'This account is listed in ADMIN_USERNAMES and stays an administrator.',
      );
    }

    const changed = await setAccountRole(deps.db, {
      actorId: admin.accountId,
      targetId: accountId,
      role,
      reason: reason.reason,
      now: new Date(),
    });
    if (!changed) return apiError('INVALID_REQUEST', 409, 'The account already has this role');
    return apiSuccess({ id: accountId, role });
  });
}
