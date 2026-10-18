/**
 * Whether a request may use the API key and base URL it carries. Only an administrator may,
 * and only for a key of their own. Everyone else gets the server's configured providers, and a
 * provider the server does not manage then fails as missing its key. With accounts off there is
 * no identity to check, so the client's key is used as before.
 */
import { accountsEnabled, resolveRequestAccount } from '@/lib/server/accounts/runtime';

import { can } from './policy';

export async function clientKeysAllowed(headers: Headers): Promise<boolean> {
  if (!accountsEnabled()) return true;
  const account = await resolveRequestAccount(headers);
  return can({ accountId: account?.accountId, role: account?.role }, 'provider.personalKey');
}
