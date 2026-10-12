import { handleListAccounts } from '@/lib/server/accounts/admin-handlers';

export const runtime = 'nodejs';

/** Lists accounts for an administrator, one page at a time. */
export async function GET(request: Request): Promise<Response> {
  return handleListAccounts(request);
}
