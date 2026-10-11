import { randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing and policy. Hashes are scrypt from node:crypto, with the cost
 * stored in each hash (`scrypt$N$r$p$salt$key`), so the cost can be raised later
 * without invalidating existing passwords. Input is NFKC-normalized, so one typed
 * password matches across input methods (composed and decomposed Vietnamese).
 */

const SCRYPT = 'scrypt';
const KEY_BYTES = 64;
const SALT_BYTES = 16;
const COST = { N: 2 ** 15, r: 8, p: 1 } as const;
/** Above 128 * N * r, which is 32 MiB at COST; node's default cap is exactly that. */
const MAX_MEMORY = 64 * 1024 * 1024;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;

export interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

/**
 * At most this many scrypt derivations run at once; the rest wait their turn. Below the libuv pool
 * size (4), so a login burst cannot take every thread that file and DNS work also need.
 */
const MAX_CONCURRENT_DERIVATIONS = 2;
let running = 0;
const waiting: Array<() => void> = [];

async function derive(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  // A finished derivation hands its slot straight to the next waiter, so `running` never dips.
  if (running < MAX_CONCURRENT_DERIVATIONS) running += 1;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    const options: ScryptOptions = { N: cost.N, r: cost.r, p: cost.p, maxmem: MAX_MEMORY };
    return await new Promise((resolve, reject) => {
      scrypt(normalizePassword(password), salt, KEY_BYTES, options, (error, key) =>
        error ? reject(error) : resolve(key),
      );
    });
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, COST);
  return [
    SCRYPT,
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/** The cost, salt and key of a stored hash; `undefined` for anything this module did not write. */
function parseHash(stored: string): { cost: ScryptCost; salt: Buffer; key: Buffer } | undefined {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== SCRYPT) return undefined;
  const cost = { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) };
  const salt = Buffer.from(parts[4] ?? '', 'base64url');
  const key = Buffer.from(parts[5] ?? '', 'base64url');
  const sane =
    Number.isInteger(cost.N) &&
    cost.N >= 2 ** 10 &&
    cost.N <= 2 ** 20 &&
    (cost.N & (cost.N - 1)) === 0 &&
    Number.isInteger(cost.r) &&
    cost.r >= 1 &&
    cost.r <= 16 &&
    Number.isInteger(cost.p) &&
    cost.p >= 1 &&
    cost.p <= 4 &&
    128 * cost.N * cost.r <= MAX_MEMORY;
  return sane && salt.length === SALT_BYTES && key.length === KEY_BYTES
    ? { cost, salt, key }
    : undefined;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const key = await derive(password, parsed.salt, parsed.cost);
  return timingSafeEqual(key, parsed.key);
}

let dummy: Promise<string> | undefined;

/**
 * A hash of a random password at the current cost. A sign-in for an unknown
 * username verifies against it, so a miss takes as long as a hit.
 */
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(24).toString('base64url'));
  return dummy;
}

export type PasswordProblem = 'length' | 'username' | 'common';

/** Lowercase passwords refused outright. Every entry is at least as long as the minimum. */
const COMMON_PASSWORDS = new Set([
  'password123',
  'password1234',
  'passw0rd123',
  'qwertyuiop',
  'qwerty12345',
  'qwerty123456',
  '1q2w3e4r5t',
  '1234567890',
  '0123456789',
  'iloveyou1234',
  'letmein123',
  'welcome1234',
  'admin123456',
  'changeme123',
  'monkey12345',
  'dragon12345',
  'football123',
  'abc1234567',
  'zaq1zaq1zaq1',
  'qazwsxedcrfv',
  'matkhau1234',
  'matkhau12345',
  'openmaic123',
  'openmaic1234',
  'trustno12345',
  'sunshine1234',
  'princess1234',
  'superman1234',
]);

/** Why a password may not be set for `username` (normalized), or `undefined` when it may. */
export function passwordProblem(password: string, username: string): PasswordProblem | undefined {
  const text = normalizePassword(password);
  const length = [...text].length;
  if (length < PASSWORD_MIN || length > PASSWORD_MAX) return 'length';
  const lower = text.toLowerCase();
  if (lower.includes(username.toLowerCase())) return 'username';
  return COMMON_PASSWORDS.has(lower) ? 'common' : undefined;
}

const TEMPORARY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A random temporary password (16 characters in four groups), redrawn until it passes the policy. */
export function generateTemporaryPassword(username: string): string {
  for (;;) {
    let raw = '';
    for (let i = 0; i < 16; i += 1) {
      raw += TEMPORARY_ALPHABET.charAt(randomInt(TEMPORARY_ALPHABET.length));
    }
    const candidate = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
    if (passwordProblem(candidate, username) === undefined) return candidate;
  }
}
