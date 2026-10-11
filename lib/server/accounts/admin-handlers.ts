/**
 * Request handling for the administrator account routes. Every request is checked
 * for administrator status first, and every change or read is written to the audit
 * table with the administrator's account id.
 */
import { apiError, apiSuccess } from '@/lib/server/api-response';

import { requireAdministrator } from './admin';
import {
  accountsNotConfigured,
  crossSiteRefusal,
  isCrossSiteRequest,
  readJsonObject,
  runAccountRoute,
} from './http';
import { accountServiceDeps, accountsEnabled } from './runtime';
import { listAccounts, recordAdminRead, setAccountDisabled } from './store';

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

/** One page of accounts, with no password material. Each page read is audited. */
export async function handleListAccounts(request: Request): Promise<Response> {
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    const admin = await requireAdministrator(request.headers);
    if (admin instanceof Response) return admin;

    const url = new URL(request.url);
    const limit = parsePageLimit(url.searchParams.get('limit'));
    const after = url.searchParams.get('after') ?? undefined;
    if (after !== undefined && !ACCOUNT_ID_PATTERN.test(after)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid page cursor');
    }

    const deps = await accountServiceDeps();
    await recordAdminRead(deps.db, {
      actorId: admin.accountId,
      action: 'list',
      reason: after === undefined ? undefined : `after=${after}`,
      now: new Date(),
    });
    const rows = await listAccounts(deps.db, after, limit + 1);
    const page = rows.slice(0, limit);
    const nextAfter = rows.length > limit ? page[page.length - 1]!.id : null;
    return apiSuccess({ accounts: page, nextAfter });
  });
}

/**
 * Disables or enables one account. The body is an object that may carry a `reason`
 * of at most 200 characters. An administrator cannot disable their own account, so
 * the last administrator cannot lock everyone out from the API.
 */
export async function handleAccountDisabledChange(
  request: Request,
  accountId: string,
  disable: boolean,
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
    const reason = body.body.reason;
    if (
      reason !== undefined &&
      (typeof reason !== 'string' || Array.from(reason).length > REASON_MAX_LENGTH)
    ) {
      return apiError(
        'INVALID_REQUEST',
        400,
        `reason must be text of at most ${REASON_MAX_LENGTH} characters`,
      );
    }
    if (disable && accountId === admin.accountId) {
      return apiError('INVALID_REQUEST', 400, 'An administrator cannot disable their own account');
    }

    const deps = await accountServiceDeps();
    const changed = await setAccountDisabled(deps.db, {
      actorId: admin.accountId,
      targetId: accountId,
      disable,
      reason: typeof reason === 'string' ? reason : undefined,
      now: new Date(),
    });
    if (!changed) return apiError('INVALID_REQUEST', 404, 'Account not found');
    return apiSuccess({ id: accountId, disabled: disable });
  });
}
