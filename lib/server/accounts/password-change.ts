import { randomBytes } from 'crypto';
import type { AccountQueryable } from './store';

/**
 * Replaces an account's password hash and revokes its live sessions in one statement. A
 * self-service change keeps the session it was made from (`keepTokenHash`); a staff reset
 * revokes them all and is written to the audit log as `password_reset` by `actorId`.
 * Returns false when no account has that id.
 */
export async function updatePassword(
  db: AccountQueryable,
  input: {
    accountId: string;
    passwordHash: string;
    now: Date;
    keepTokenHash?: string;
    actorId?: string;
  },
): Promise<boolean> {
  const result = await db.query(
    `WITH target AS (
       UPDATE accounts SET password_hash = $2::text WHERE id = $1::text RETURNING id
     ), revoked AS (
       UPDATE account_sessions
          SET revoked_at = $3::timestamptz
        WHERE account_id IN (SELECT id FROM target)
          AND revoked_at IS NULL
          AND ($4::text IS NULL OR token_hash <> $4::text)
        RETURNING token_hash
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $5::text, id, 'password_reset', NULL, $3::timestamptz FROM target
        WHERE $5::text IS NOT NULL
       RETURNING id
     )
     SELECT id FROM target`,
    [
      input.accountId,
      input.passwordHash,
      input.now.toISOString(),
      input.keepTokenHash ?? null,
      input.actorId ?? null,
    ],
  );
  return result.rows.length > 0;
}

/** A one-time password for a staff reset: 14 characters without look-alikes, about 80 bits. */
export function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(14), (byte) => alphabet[byte % alphabet.length]).join('');
}
