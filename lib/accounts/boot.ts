import { configureOwnerAuthentication } from '@/lib/server/identity';

import { accountsEnabled } from './gate';
import { accountsAuthMethod } from './owner';

/**
 * Registers the accounts owner method when `OPENMAIC_ACCOUNTS=true`. Called from
 * `instrumentation.ts` before owner identity validation. The settings that name
 * one fixed owner for every request, and the automatic claim trigger, are
 * refused beside it.
 */
export function configureAccountsAuthentication(): void {
  if (!accountsEnabled()) return;
  const singleUser = process.env.OWNER_SINGLE_USER?.trim().toLowerCase();
  if (singleUser === 'true' || singleUser === '1') {
    throw new Error(
      'OPENMAIC_ACCOUNTS=true cannot be combined with OWNER_SINGLE_USER=true: accounts give each ' +
        'person an owner of their own. Unset OWNER_SINGLE_USER.',
    );
  }
  if (process.env.PERSISTENCE_SHARED_OWNER_ID?.trim()) {
    throw new Error(
      'OPENMAIC_ACCOUNTS=true cannot be combined with PERSISTENCE_SHARED_OWNER_ID: accounts give ' +
        'each person an owner of their own. Unset PERSISTENCE_SHARED_OWNER_ID.',
    );
  }
  if (process.env.OWNER_CLAIM_TRIGGER?.trim() === 'auto') {
    throw new Error(
      'OPENMAIC_ACCOUNTS=true cannot be combined with OWNER_CLAIM_TRIGGER=auto: a request that ' +
        'carries a signed-in session and an old anonymous cookie would move that anonymous ' +
        'work into the account with no action by the person. Unset OWNER_CLAIM_TRIGGER, or ' +
        'set it to explicit.',
    );
  }
  configureOwnerAuthentication({ methods: [accountsAuthMethod], anonymousFallback: false });
}
