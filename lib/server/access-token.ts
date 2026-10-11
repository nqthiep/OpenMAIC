import { createHmac, timingSafeEqual } from 'crypto';

import { createLogger } from '@/lib/logger';

import { ACCESS_SECRET_MIN_LENGTH, accessSigningKey } from './access-token-edge';
import {
  isAccessTokenSignatureFormatValid,
  isAccessTokenTimestampValid,
} from './access-token-shared';

const log = createLogger('AccessToken');

let warnedAboutSecret = false;

/**
 * Warn once per process while the site cookie is signed with `ACCESS_CODE`
 * because `OPENMAIC_ACCESS_SECRET` is missing or too short. It runs at boot
 * (instrumentation.ts) and whenever a cookie is minted.
 */
export function warnIfAccessSecretIsWeak(): void {
  if (warnedAboutSecret) return;
  const secret = process.env.OPENMAIC_ACCESS_SECRET;
  if (secret !== undefined && [...secret].length >= ACCESS_SECRET_MIN_LENGTH) return;

  warnedAboutSecret = true;
  log.warn(
    secret === undefined
      ? 'OPENMAIC_ACCESS_SECRET is not set. Access cookies are signed with ACCESS_CODE, so a copied cookie can be checked offline against it. Set a random value of at least ' +
          `${ACCESS_SECRET_MIN_LENGTH} characters.`
      : `OPENMAIC_ACCESS_SECRET is shorter than ${ACCESS_SECRET_MIN_LENGTH} characters and is ignored.`,
  );
}

/** `timestamp.signature`, the signature being HMAC-SHA256 of the timestamp under `key`. */
export function createKeyedAccessToken(key: string): string {
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', key).update(timestamp).digest('hex');
  return `${timestamp}.${signature}`;
}

/** Verify a token made by {@link createKeyedAccessToken} with the same `key`. */
export function verifyKeyedAccessToken(token: string, key: string): boolean {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  // Reject expired, future-dated, and malformed timestamps before spending
  // work on the HMAC comparison.
  if (!isAccessTokenTimestampValid(timestamp)) return false;

  // Reject non-canonical signatures so this verifier agrees with the Edge one.
  if (!isAccessTokenSignatureFormatValid(signature)) return false;

  const expected = createHmac('sha256', key).update(timestamp).digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;

  return timingSafeEqual(sigBuf, expBuf);
}

/** Site access cookie, keyed by {@link accessSigningKey}. */
export function createAccessToken(accessCode: string): string {
  warnIfAccessSecretIsWeak();
  return createKeyedAccessToken(accessSigningKey(accessCode));
}

/** Verify a site access cookie against `accessCode` with the same key rule as the signer. */
export function verifyAccessToken(token: string, accessCode: string): boolean {
  return verifyKeyedAccessToken(token, accessSigningKey(accessCode));
}
