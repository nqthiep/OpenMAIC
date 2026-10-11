/**
 * Usernames: the one spelling a sign-in is matched on. Stored and compared in
 * lowercase, ASCII only, so no account can be issued under a lookalike of
 * another account's name.
 */

const USERNAME_SHAPE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Names that read as system or route names; never issued. */
const RESERVED = new Set([
  'admin',
  'root',
  'system',
  'api',
  'login',
  'account',
  'support',
  'openmaic',
]);

/** A typed username in its stored form: surrounding space dropped, lowercase. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

/** Whether a normalized username has the allowed shape. Reserved names are not checked here. */
export function isUsernameShape(username: string): boolean {
  return USERNAME_SHAPE.test(username);
}

/** Why a normalized username may not be issued, or `undefined` when it may. */
export function usernameProblem(username: string): 'format' | 'reserved' | undefined {
  if (!isUsernameShape(username)) return 'format';
  return RESERVED.has(username) ? 'reserved' : undefined;
}
