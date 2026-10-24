/**
 * The key that signs ACCESS_CODE tokens. Pure TypeScript with no Node or Web
 * Crypto imports, so the Node verifier (lib/server/access-token.ts), the Edge
 * middleware (middleware.ts) and the verify route all derive the same key. The
 * token lifetime rule lives in access-token-shared.ts.
 */

/** Shortest ACCESS_COOKIE_SECRET accepted. A shorter value is ignored, with a one-time warning. */
export const ACCESS_COOKIE_SECRET_MIN_LENGTH = 32;

let warnedAboutShortSecret = false;

/**
 * The key that signs access cookies. With ACCESS_COOKIE_SECRET set to at least
 * 32 characters, cookies are signed with that secret, so a captured cookie cannot
 * be checked against guesses of the access code. Without it the access code is the
 * key, as before: the signature then reveals nothing beyond the code's own strength.
 */
export function accessSigningKey(
  accessCode: string,
  secret: string | undefined = process.env.ACCESS_COOKIE_SECRET,
): string {
  const trimmed = secret?.trim() ?? '';
  if (trimmed === '') return accessCode;
  if (trimmed.length < ACCESS_COOKIE_SECRET_MIN_LENGTH) {
    if (!warnedAboutShortSecret) {
      warnedAboutShortSecret = true;
      console.warn(
        `ACCESS_COOKIE_SECRET is shorter than ${ACCESS_COOKIE_SECRET_MIN_LENGTH} characters and is ignored; access cookies are signed with ACCESS_CODE.`,
      );
    }
    return accessCode;
  }
  return trimmed;
}
