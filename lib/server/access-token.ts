import { createHmac, timingSafeEqual } from 'crypto';

import { isAccessTokenTimestampFresh } from './access-token-policy';

/** Create an HMAC-signed token: `timestamp.signature` */
export function createAccessToken(accessCode: string): string {
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', accessCode).update(timestamp).digest('hex');
  return `${timestamp}.${signature}`;
}

/**
 * Verify an HMAC-signed token against the access code. The signature must match
 * and the token must be recent: a valid signature on an expired token is refused.
 */
export function verifyAccessToken(token: string, accessCode: string): boolean {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);
  if (!isAccessTokenTimestampFresh(timestamp, Date.now())) return false;

  const expected = createHmac('sha256', accessCode).update(timestamp).digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;

  return timingSafeEqual(sigBuf, expBuf);
}
