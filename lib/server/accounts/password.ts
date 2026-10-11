/**
 * Password hashing for account sign-in.
 *
 * Uses scrypt from `node:crypto`, so no native dependency is added. Every hash
 * stores its own cost parameters and salt, which lets the cost be raised later
 * without invalidating existing hashes: verification reads N, r and p from the
 * stored value rather than from the current constants.
 *
 * Stored format: `scrypt$<N>$<r>$<p>$<saltBase64url>$<hashBase64url>`
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const SCHEME = 'scrypt';

/** CPU/memory cost. 2^16 with r=8 needs 64 MiB per hash; see MAX_MEMORY_BYTES. */
const COST_N = 2 ** 16;
const BLOCK_SIZE_R = 8;
const PARALLELISM_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** scrypt needs 128 * N * r bytes; this ceiling leaves headroom for COST_N. */
const MAX_MEMORY_BYTES = 128 * 1024 * 1024;

/**
 * Bounds applied to hashes read back from storage. A stored value outside these
 * limits is treated as invalid rather than used, so a corrupted or hostile row
 * cannot make verification allocate unbounded memory or CPU.
 */
const MIN_COST_N = 2 ** 14;
const MAX_COST_N = 2 ** 18;
const MAX_BLOCK_SIZE_R = 16;
const MAX_PARALLELISM_P = 4;
const MIN_KEY_LENGTH = 16;
const MAX_KEY_LENGTH = 128;
const MAX_SALT_LENGTH = 64;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Length limits in code points. NIST SP 800-63B: no composition rules, a sensible floor and ceiling. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;

interface ParsedHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

/**
 * At most this many derivations run at once. Each one allocates its full
 * working set (64 MiB at the current cost), so unbounded concurrency would let
 * a burst of requests exhaust the process's memory.
 */
const MAX_CONCURRENT_DERIVATIONS = 2;
/**
 * Waiting derivations allowed behind the active ones. Past this the caller gets
 * PasswordWorkBusyError at once, so a flood of requests cannot queue without bound.
 */
const MAX_QUEUED_DERIVATIONS = 64;
let activeDerivations = 0;
const derivationQueue: Array<() => void> = [];

/**
 * Thrown when a password check cannot run now: the derivation queue is full, or
 * the native scrypt call failed (in practice, an allocation failure under memory
 * pressure). Both are transient, so the route answers 503 and the client may retry.
 * `reason` keeps the underlying error for logs; it is never sent to the client.
 */
export class PasswordWorkBusyError extends Error {
  constructor(readonly reason?: unknown) {
    super('Password checks are busy');
    this.name = 'PasswordWorkBusyError';
  }
}

async function acquireDerivationSlot(): Promise<void> {
  if (activeDerivations < MAX_CONCURRENT_DERIVATIONS) {
    activeDerivations += 1;
    return;
  }
  if (derivationQueue.length >= MAX_QUEUED_DERIVATIONS) throw new PasswordWorkBusyError();
  // The slot is handed over directly, so the count never drops below the limit while waiting.
  await new Promise<void>((resolve) => derivationQueue.push(resolve));
}

function releaseDerivationSlot(): void {
  const next = derivationQueue.shift();
  if (next) next();
  else activeDerivations -= 1;
}

async function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { n: number; r: number; p: number },
): Promise<Buffer> {
  const scryptOptions: ScryptOptions = {
    N: options.n,
    r: options.r,
    p: options.p,
    maxmem: MAX_MEMORY_BYTES,
  };
  await acquireDerivationSlot();
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, keyLength, scryptOptions, (error, derivedKey) => {
        if (error) reject(new PasswordWorkBusyError(error));
        else resolve(derivedKey);
      });
    });
  } finally {
    releaseDerivationSlot();
  }
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/** Plain decimal digits only. Number() would also accept hex, exponents, decimals and spaces. */
const STRICT_DECIMAL = /^[1-9][0-9]*$/;

function parseStrictInteger(raw: string): number | undefined {
  if (!STRICT_DECIMAL.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

function parseStoredHash(stored: string): ParsedHash | undefined {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== SCHEME) return undefined;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const n = parseStrictInteger(rawN);
  const r = parseStrictInteger(rawR);
  const p = parseStrictInteger(rawP);
  if (n === undefined || r === undefined || p === undefined) return undefined;
  if (!isPowerOfTwo(n) || n < MIN_COST_N || n > MAX_COST_N) return undefined;
  if (r < 1 || r > MAX_BLOCK_SIZE_R) return undefined;
  if (p < 1 || p > MAX_PARALLELISM_P) return undefined;
  // The memory scrypt charges (OpenSSL's check, enforced through maxmem): the lookup
  // table of N + 2 blocks plus p working blocks, each 128·r bytes. The earlier
  // 128·N·r check accepted parameters that scrypt then rejected at the boundary.
  if (128 * r * (n + 2) + 128 * r * p > MAX_MEMORY_BYTES) return undefined;

  if (!BASE64URL.test(rawSalt) || !BASE64URL.test(rawHash)) return undefined;
  const salt = Buffer.from(rawSalt, 'base64url');
  const hash = Buffer.from(rawHash, 'base64url');
  if (salt.length < 1 || salt.length > MAX_SALT_LENGTH) return undefined;
  if (hash.length < MIN_KEY_LENGTH || hash.length > MAX_KEY_LENGTH) return undefined;

  return { n, r, p, salt, hash };
}

/**
 * Hash a password for storage. Callers validate length first; this function
 * only guards its own input type.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string') throw new TypeError('password must be a string');
  const salt = randomBytes(SALT_LENGTH);
  const hash = await deriveKey(password, salt, KEY_LENGTH, {
    n: COST_N,
    r: BLOCK_SIZE_R,
    p: PARALLELISM_P,
  });
  return [
    SCHEME,
    String(COST_N),
    String(BLOCK_SIZE_R),
    String(PARALLELISM_P),
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

/**
 * Check a password against a stored hash in constant time. Returns false for a
 * malformed stored value rather than throwing, so a bad row reads as a failed
 * sign-in, not a server error.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== 'string') return false;
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;
  const candidate = await deriveKey(password, parsed.salt, parsed.hash.length, {
    n: parsed.n,
    r: parsed.r,
    p: parsed.p,
  });
  return timingSafeEqual(candidate, parsed.hash);
}

/**
 * A real hash of a fixed placeholder, computed once per process. Sign-in for an
 * unknown username verifies against it so the response time does not reveal
 * whether the username exists. The placeholder is not a credential.
 */
let dummyHashPromise: Promise<string> | undefined;

export function verifyAgainstDummyHash(password: string): Promise<boolean> {
  // A failed computation is not cached, so the next unknown-username sign-in retries it.
  dummyHashPromise ??= hashPassword('openmaic-timing-placeholder-not-a-password').catch(
    (error: unknown) => {
      dummyHashPromise = undefined;
      throw error;
    },
  );
  return dummyHashPromise.then((dummy) => verifyPassword(password, dummy)).then(() => false);
}
