/**
 * Same-origin client for the account routes. Every failure is thrown as an
 * AccountRequestError that carries the server's error code and retry hint.
 * Neither the submitted password nor the response body is kept on the error.
 */
import type { Capabilities } from '@/lib/server/authz/capabilities';

export interface AccountSession {
  readonly enabled: boolean;
  readonly registrationOpen: boolean;
  readonly authenticated: boolean;
  readonly account?: { readonly username: string };
  /** The effective role of the signed-in account. */
  readonly role?: AccountRole;
  /** The account's membership, or null when it has none. Only the account's own session sees it. */
  readonly membership?: AccountMembership | null;
  /** True only when the signed-in account is an administrator. */
  readonly administrator?: boolean;
  /** What this visitor may do. The interface gates on these; the server checks each request again. */
  readonly capabilities?: Capabilities;
}

export interface AccountMembership {
  readonly status: 'active' | 'suspended';
  /** True when the membership is not suspended and has not expired. */
  readonly active: boolean;
  readonly expiresAt: string;
  readonly monthlyQuota: number;
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

const CAPABILITY_KEYS: readonly (keyof Capabilities)[] = [
  'generate',
  'proMode',
  'joinClass',
  'exportCourse',
  'shareCourse',
  'requestAccess',
  'personalProviderKey',
  'viewProviders',
  'dashboard',
  'viewUsage',
  'manageMembers',
  'decideShares',
  'markPreviews',
  'manageClasses',
  'viewAudit',
  'changeRoles',
  'disableLearners',
];

/** Any capability the server did not send is false: a missing flag never unlocks anything. */
function capabilitiesFrom(value: unknown): Capabilities {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(
    CAPABILITY_KEYS.map((key) => [key, record[key] === true]),
  ) as unknown as Capabilities;
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
    role: isAccountRole(body.role) ? body.role : undefined,
    membership: isRecord(body.membership)
      ? {
          status: body.membership.status === 'suspended' ? 'suspended' : 'active',
          active: body.membership.active === true,
          expiresAt: typeof body.membership.expiresAt === 'string' ? body.membership.expiresAt : '',
          monthlyQuota:
            typeof body.membership.monthlyQuota === 'number' ? body.membership.monthlyQuota : 0,
        }
      : null,
    administrator: body.administrator === true,
    capabilities: capabilitiesFrom(body.capabilities),
  };
}

export const ACCOUNT_SESSION_CHANGED_EVENT = 'openmaic:account-session-changed';

let sharedSession: Promise<AccountSession> | undefined;

/** The session, fetched once and shared by every reader until it changes. */
export function loadSharedSession(): Promise<AccountSession> {
  sharedSession ??= fetchAccountSession().catch((error: unknown) => {
    sharedSession = undefined;
    throw error;
  });
  return sharedSession;
}

/** Forgets the shared session and tells every mounted reader to ask again. */
export function sessionChanged(): void {
  sharedSession = undefined;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ACCOUNT_SESSION_CHANGED_EVENT));
  }
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

export async function signIn(credentials: AccountCredentials): Promise<{ username: string }> {
  const account = await postCredentials('/api/auth/login', credentials);
  sessionChanged();
  return account;
}

export async function createAccount(
  credentials: AccountCredentials,
): Promise<{ username: string }> {
  const account = await postCredentials('/api/auth/register', credentials);
  sessionChanged();
  return account;
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
  sessionChanged();
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

/** An account role. `admin` and `operator` can open the administration page. */
export type AccountRole = 'learner' | 'operator' | 'admin';

const ACCOUNT_ROLES: readonly AccountRole[] = ['learner', 'operator', 'admin'];

function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && (ACCOUNT_ROLES as readonly string[]).includes(value);
}

/** One account as the administrator list reports it. The list never carries password material. */
export interface AdminAccount {
  readonly id: string;
  readonly username: string;
  readonly role: AccountRole;
  readonly createdAt: string;
  readonly disabledAt: string | null;
}

export interface AdminAccountPage {
  readonly accounts: readonly AdminAccount[];
  readonly nextAfter: string | null;
}

function isAdminAccount(value: unknown): value is AdminAccount {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.username === 'string' &&
    isAccountRole(value.role) &&
    typeof value.createdAt === 'string' &&
    (value.disabledAt === null || typeof value.disabledAt === 'string')
  );
}

/**
 * One page of accounts in id order. Pass the previous page's `nextAfter` to read the next.
 * A visitor who is not an administrator gets 403, or 401 when signed out.
 */
export async function fetchAdminAccounts(after?: string): Promise<AdminAccountPage> {
  const query = after === undefined ? '' : `?after=${encodeURIComponent(after)}`;
  const response = await fetch(`/api/admin/accounts${query}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const body = await readJson(response);
  if (!response.ok || !isRecord(body) || body.success !== true) {
    throw failureFrom(response, body);
  }
  const { accounts, nextAfter } = body;
  if (!Array.isArray(accounts) || !accounts.every(isAdminAccount)) {
    throw failureFrom(response, body);
  }
  return { accounts, nextAfter: typeof nextAfter === 'string' ? nextAfter : null };
}

/** Disables an account. Its sessions stop working at once. The server refuses the caller's own account. */
export function disableAccount(accountId: string): Promise<void> {
  return postAccountDisabled(accountId, 'disable');
}

/** Enables an account. Sessions that the disable ended stay ended; the account signs in again. */
export function enableAccount(accountId: string): Promise<void> {
  return postAccountDisabled(accountId, 'enable');
}

/** Sets the stored role of an account. Only an administrator may call this; the server refuses everyone else. */
export async function changeAccountRole(accountId: string, role: AccountRole): Promise<void> {
  const response = await fetch(`/api/admin/accounts/${encodeURIComponent(accountId)}/role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ role }),
  });
  const body = await readJson(response);
  if (!response.ok || !isRecord(body) || body.success !== true) {
    throw failureFrom(response, body);
  }
}

/** Changes the signed-in account's password. Other sessions are signed out; this one stays. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await fetch('/api/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = await readJson(response);
  if (!response.ok || !isRecord(body) || body.success !== true) {
    throw failureFrom(response, body);
  }
}

/** Gives an account a one-time password (staff only) and returns it, to hand over once. */
export async function resetAccountPassword(accountId: string): Promise<string> {
  const response = await fetch(`/api/admin/accounts/${encodeURIComponent(accountId)}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  const body = await readJson(response);
  if (!response.ok || !isRecord(body) || body.success !== true) {
    throw failureFrom(response, body);
  }
  return typeof body.temporaryPassword === 'string' ? body.temporaryPassword : '';
}

async function postAccountDisabled(accountId: string, action: 'disable' | 'enable'): Promise<void> {
  const response = await fetch(`/api/admin/accounts/${encodeURIComponent(accountId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    // The route reads a JSON object. An empty object sends no reason.
    body: JSON.stringify({}),
  });
  const body = await readJson(response);
  if (!response.ok || !isRecord(body) || body.success !== true) {
    throw failureFrom(response, body);
  }
}
