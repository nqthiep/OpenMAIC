import { requireStaff } from '@/lib/server/accounts/admin';
import {
  accountsNotConfigured,
  crossSiteRefusal,
  isCrossSiteRequest,
  runAccountRoute,
} from '@/lib/server/accounts/http';
import { hashPassword } from '@/lib/server/accounts/password';
import { temporaryPassword, updatePassword } from '@/lib/server/accounts/password-change';
import { accountServiceDeps, accountsEnabled } from '@/lib/server/accounts/runtime';
import { findAccountRoleById } from '@/lib/server/accounts/store';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import { effectiveRole } from '@/lib/server/authz/roles';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gives an account a one-time password, shown once to the staff member who hands it over, and
 * signs the account out everywhere. Who may do it follows the disable rule: an operator for
 * learners and operators, only an administrator for an administrator. Staff change their own
 * password from the account menu instead. Logged as `password_reset`.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return runAccountRoute(async () => {
    if (!accountsEnabled()) return accountsNotConfigured();
    if (isCrossSiteRequest(request)) return crossSiteRefusal();
    const staff = await requireStaff(request.headers);
    if (staff instanceof Response) return staff;
    if (!ACCOUNT_ID_PATTERN.test(id)) return apiError('INVALID_REQUEST', 400, 'Invalid account id');
    if (id === staff.accountId) {
      return apiError('INVALID_REQUEST', 400, 'Change your own password from the account menu.');
    }

    const deps = await accountServiceDeps();
    const target = await findAccountRoleById(deps.db, id);
    if (!target) return apiError('NOT_FOUND', 404, 'Account not found');
    const viewer = { accountId: staff.accountId, role: effectiveRole(staff.username, staff.role) };
    if (
      !can(viewer, 'accounts.disable', { targetRole: effectiveRole(target.username, target.role) })
    ) {
      return apiError('ADMIN_ONLY', 403, 'Only an administrator can change an administrator.');
    }

    const password = temporaryPassword();
    await updatePassword(deps.db, {
      accountId: id,
      passwordHash: await hashPassword(password),
      actorId: staff.accountId,
      now: new Date(),
    });
    return apiSuccess({ id, username: target.username, temporaryPassword: password });
  });
}
