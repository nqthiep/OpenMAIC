import type { AccountSession } from '@/components/account/account-api';

/** A starter prompt's blank, e.g. `[chủ đề]`: the learner must replace it before generating. */
export const TEMPLATE_BLANK = /\[[^\]]+\]/;

/**
 * Provider and model choices in the composer are for operators and administrators. With accounts
 * off there is one local user, who keeps them. False while the session is unknown.
 */
export function canChooseProvider(session: AccountSession | null | undefined): boolean {
  return session?.enabled === false || session?.role === 'operator' || session?.role === 'admin';
}
