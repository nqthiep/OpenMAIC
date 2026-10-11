import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password';

/**
 * Username policy. Usernames are ASCII so that uniqueness has no Unicode
 * look-alike ambiguity, and are stored lowercase so "Alice" and "alice" cannot
 * both exist. Length 3-32, starting with a letter or digit.
 */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
/** Applied to the raw input, before lowercasing: some non-ASCII letters (the Kelvin sign, for one) lowercase to ASCII. */
const USERNAME_INPUT_PATTERN = /^[A-Za-z0-9._-]+$/;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

/** Returns the canonical (trimmed, lowercase) username, or undefined when it is not allowed. */
export function normalizeUsername(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  if (!USERNAME_INPUT_PATTERN.test(trimmed)) return undefined;
  const candidate = trimmed.toLowerCase();
  return USERNAME_PATTERN.test(candidate) ? candidate : undefined;
}

/**
 * Passwords are never trimmed or normalized: what the user typed is what is
 * hashed. Only the length and the absence of NUL are checked.
 */
export function isAcceptablePassword(input: unknown): input is string {
  if (typeof input !== 'string') return false;
  if (input.includes('\u0000')) return false;
  const length = [...input].length;
  return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
}

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH };
