import type { AccountRole, AccountStatus } from './messages';

/** An account as the administration API lists it: never a password hash. */
export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: AccountRole;
  status: AccountStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** One audit entry. `detail` holds field names and roles only, never a secret. */
export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  actor: { id: string; username: string | null } | null;
  target: { id: string; username: string | null } | null;
  detail: Record<string, unknown>;
}
