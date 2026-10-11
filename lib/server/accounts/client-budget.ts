/**
 * A failure budget per client address for sign-in and registration.
 *
 * It applies only when forwarded headers are trusted (TRUST_PROXY_HEADERS=true),
 * because only then is the address trustworthy. Without a trusted proxy, one
 * shared bucket would throttle every sign-in, so the per-username limit alone
 * applies there. The limit is sized for a class behind one school network:
 * 30 counted failures per 15 minutes. Only failures are charged, so a class that
 * signs up legitimately from one network is not throttled by its own successes.
 */
import type { AccountErrorCode } from './service';
import { AccountError } from './service';
import { LoginThrottle } from './login-throttle';

export const CLIENT_BUDGET_LIMITS = {
  maxFailures: 30,
  windowMs: 15 * 60 * 1000,
  maxKeys: 10_000,
};

const globalState = globalThis as typeof globalThis & { [key: symbol]: LoginThrottle | undefined };
const BUDGET_KEY = Symbol.for('openmaic.accounts.clientBudget');

/**
 * The key this request's failures count under, or undefined when forwarded headers
 * are not trusted. The last forwarded entry is the one the nearest trusted proxy
 * appended; earlier entries come from the client.
 */
export function trustedClientKey(headers: Headers): string | undefined {
  if (process.env.TRUST_PROXY_HEADERS !== 'true') return undefined;
  const forwarded = headers.get('x-forwarded-for')?.split(',').pop()?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'anonymous';
}

function clientBudget(): LoginThrottle {
  return (globalState[BUDGET_KEY] ??= new LoginThrottle(CLIENT_BUDGET_LIMITS));
}

function refusal(retryAfterSeconds: number | undefined): AccountError {
  return new AccountError(
    'RATE_LIMITED',
    'Too many failed attempts from this network. Try again later.',
    retryAfterSeconds,
  );
}

/**
 * Runs one attempt against the client's budget. The attempt's slot is reserved before
 * the attempt starts, so concurrent attempts from one client count against the budget
 * together. A slot is kept only when the attempt fails with `countedCode`. Every other
 * outcome gives the slot back. A client whose budget is spent is refused before the
 * attempt runs.
 */
export async function withClientBudget<T>(
  key: string | undefined,
  countedCode: AccountErrorCode,
  attempt: () => Promise<T>,
): Promise<T> {
  if (key === undefined) return attempt();
  const budget = clientBudget();
  const retryAfter = budget.retryAfterSeconds(key);
  if (retryAfter !== undefined) throw refusal(retryAfter);

  const token = budget.recordFailure(key);
  if (token === undefined) throw refusal(budget.retryAfterSeconds(key));

  let counted = false;
  try {
    return await attempt();
  } catch (error) {
    counted = error instanceof AccountError && error.code === countedCode;
    throw error;
  } finally {
    if (!counted) budget.refund(key, token);
  }
}
