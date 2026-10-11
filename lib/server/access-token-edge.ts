import {
  isAccessTokenSignatureFormatValid,
  isAccessTokenTimestampValid,
} from './access-token-shared';

/**
 * Edge-compatible verifier for HMAC-signed access tokens.
 *
 * This lives outside `proxy.ts` so it can be unit tested without loading
 * the Next.js middleware entrypoint, and it deliberately uses only the Web
 * Crypto API (no `node:crypto`) so Edge middleware can import it.
 */

/** Convert string to Uint8Array */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Shortest `OPENMAIC_ACCESS_SECRET` used as the cookie key, in code points. */
export const ACCESS_SECRET_MIN_LENGTH = 32;

/**
 * HMAC key of the site access cookie. With `OPENMAIC_ACCESS_SECRET` set and long enough, the key is
 * the secret joined with the access code: a copied cookie cannot be checked offline against the code,
 * and changing the code still revokes every cookie. Without it, the key is the access code alone. The
 * Node signer and both verifiers use this one rule. It lives here because this module imports no
 * `node:` built-ins and so runs in both runtimes.
 */
export function accessSigningKey(
  accessCode: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const secret = env.OPENMAIC_ACCESS_SECRET;
  return secret !== undefined && [...secret].length >= ACCESS_SECRET_MIN_LENGTH
    ? `${secret}\u0000${accessCode}`
    : accessCode;
}

/** Verify an HMAC-signed token using Web Crypto API (Edge-compatible) */
export async function verifyAccessTokenEdge(token: string, accessCode: string): Promise<boolean> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  // Reject expired, future-dated, and malformed timestamps before spending
  // work on the HMAC comparison.
  if (!isAccessTokenTimestampValid(timestamp)) return false;

  // Canonical lowercase hex only, matching the Node verifier.
  if (!isAccessTokenSignatureFormatValid(signature)) return false;

  const keyData = encode(accessSigningKey(accessCode));
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = encode(timestamp);
  const expected = bufToHex(await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer));

  // Constant-length comparison (not truly constant-time in JS, but sufficient here)
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
