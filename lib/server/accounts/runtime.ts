/**
 * Wires the account service to the configured server database and exposes the
 * one place where a request's signed-in identity is decided.
 *
 * Accounts exist only where server persistence is configured (DATABASE_URL).
 * Without it every request resolves exactly as before: the anonymous cookie.
 */
import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import {
  getServerPersistenceProvider,
  type PersistencePoolFactory,
} from '@/lib/persistence/server-provider';

import { DEFAULT_MONTHLY_QUOTA_TOKENS } from '@/lib/server/learning/store';

import { DEFAULT_LOGIN_THROTTLE, LoginThrottle } from './login-throttle';
import { accountOwnerId, resolveAccountSession, type AccountServiceDeps } from './service';
import { readSessionCookie } from './session';
import type { SessionAccount } from './store';

const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const globalState = globalThis as typeof globalThis & { [key: symbol]: LoginThrottle | undefined };

export function accountsEnabled(): boolean {
  return isServerPersistenceConfigured();
}

/**
 * Registration is closed unless the operator sets ACCOUNT_REGISTRATION=open. Closed
 * by default, so a deployment that never chose open registration does not offer it.
 */
export function registrationOpen(): boolean {
  return process.env.ACCOUNT_REGISTRATION?.trim().toLowerCase() === 'open';
}

/** Half the paid monthly quota: the trial is for trying, and an abused account costs half as much. */
export const DEFAULT_TRIAL_QUOTA_TOKENS = DEFAULT_MONTHLY_QUOTA_TOKENS / 2;

/**
 * The free first month every new account gets: `MEMBERSHIP_TRIAL_DAYS` days (30 when unset, 0 turns
 * it off) with `MEMBERSHIP_TRIAL_QUOTA_TOKENS` tokens (`DEFAULT_TRIAL_QUOTA_TOKENS` when unset).
 */
export function membershipTrial(): { days: number; monthlyQuota: number } | undefined {
  const raw = process.env.MEMBERSHIP_TRIAL_DAYS?.trim();
  const days = raw === undefined || raw === '' ? 30 : Number(raw);
  if (!Number.isInteger(days) || days <= 0 || days > 366) return undefined;
  const quota = Number(process.env.MEMBERSHIP_TRIAL_QUOTA_TOKENS?.trim());
  return {
    days,
    monthlyQuota: Number.isInteger(quota) && quota > 0 ? quota : DEFAULT_TRIAL_QUOTA_TOKENS,
  };
}

/** One throttle per process, kept on globalThis so dev-mode module reloads do not reset it. */
function loginThrottle(): LoginThrottle {
  return (globalState[THROTTLE_KEY] ??= new LoginThrottle(DEFAULT_LOGIN_THROTTLE));
}

/**
 * Service dependencies over the configured pool. Callers must check
 * accountsEnabled() first; this throws when DATABASE_URL is missing.
 */
export async function accountServiceDeps(
  poolFactory?: PersistencePoolFactory,
): Promise<AccountServiceDeps> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required for accounts');
  const { pool } = await getServerPersistenceProvider(connectionString, poolFactory);
  return {
    db: pool as unknown as AccountServiceDeps['db'],
    throttle: loginThrottle(),
    registrationOpen: registrationOpen(),
    trial: membershipTrial(),
  };
}

/**
 * The signed-in account for these request headers, or undefined. Makes no
 * database call when the request carries no session cookie or accounts are off.
 */
export async function resolveRequestAccount(
  headers: Headers,
  poolFactory?: PersistencePoolFactory,
): Promise<SessionAccount | undefined> {
  // The cookie is read first so a request without one never reaches the configuration check.
  const token = readSessionCookie(headers);
  if (!token || !accountsEnabled()) return undefined;
  return resolveAccountSession(await accountServiceDeps(poolFactory), token);
}

/**
 * The owner id a request must be partitioned under when it is signed in, or
 * undefined to fall back to the anonymous cookie. Pass the result as
 * `authenticatedOwnerId` to resolveRequestOwnerId.
 */
export async function resolveAuthenticatedOwnerId(
  headers: Headers,
  poolFactory?: PersistencePoolFactory,
): Promise<string | undefined> {
  const account = await resolveRequestAccount(headers, poolFactory);
  return account ? accountOwnerId(account.accountId) : undefined;
}
