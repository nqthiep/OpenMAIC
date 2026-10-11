import { randomBytes } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  hashPassword,
  PasswordWorkBusyError,
  verifyAgainstDummyHash,
  verifyPassword,
} from '@/lib/server/accounts/password';

const PASSWORD = 'correct horse battery staple';
/** Each scrypt computation at the production cost takes roughly 50-150 ms. */
const SCRYPT_TIMEOUT_MS = 30_000;

function part(stored: string, index: number): string {
  return stored.split('$')[index]!;
}

/** Replaces one `$`-separated field of a stored hash. */
function withField(stored: string, index: number, value: string): string {
  const parts = stored.split('$');
  parts[index] = value;
  return parts.join('$');
}

/**
 * Each case mutates the valid hash from beforeAll. The unmodified value is
 * verified in the first test, so a failure here comes from the mutation and
 * not from a broken fixture.
 */
const MALFORMED: Array<[string, (valid: string) => string]> = [
  ['too few fields', (valid) => valid.split('$').slice(0, 5).join('$')],
  ['too many fields', (valid) => `${valid}$extra`],
  ['a wrong scheme', (valid) => withField(valid, 0, 'bcrypt')],
  ['N that is not a power of two', (valid) => withField(valid, 1, '65537')],
  ['N below the lower bound', (valid) => withField(valid, 1, String(2 ** 13))],
  ['N above the upper bound', (valid) => withField(valid, 1, String(2 ** 19))],
  ['N that exceeds the memory ceiling for r', (valid) => withField(valid, 1, String(2 ** 18))],
  ['r of zero', (valid) => withField(valid, 2, '0')],
  ['r above the upper bound', (valid) => withField(valid, 2, '17')],
  ['p of zero', (valid) => withField(valid, 3, '0')],
  ['p above the upper bound', (valid) => withField(valid, 3, '5')],
  [
    'a salt with a standard-base64 "+"',
    (valid) => withField(valid, 4, `${part(valid, 4).slice(0, -1)}+`),
  ],
  ['a key with a "/" character', (valid) => withField(valid, 5, `${part(valid, 5).slice(0, -1)}/`)],
  ['a key with base64 padding', (valid) => withField(valid, 5, `${part(valid, 5)}==`)],
  ['an empty salt', (valid) => withField(valid, 4, '')],
  [
    'a salt longer than 64 bytes',
    (valid) => withField(valid, 4, randomBytes(65).toString('base64url')),
  ],
  [
    'a key shorter than 16 bytes',
    (valid) => withField(valid, 5, randomBytes(8).toString('base64url')),
  ],
  [
    'a key longer than 128 bytes',
    (valid) => withField(valid, 5, randomBytes(200).toString('base64url')),
  ],
];

describe('password hashing', () => {
  let stored: string;

  beforeAll(async () => {
    stored = await hashPassword(PASSWORD);
  }, SCRYPT_TIMEOUT_MS);

  it('stores six $-separated fields: scheme, N, r, p, salt and key', () => {
    const parts = stored.split('$');
    expect(parts).toHaveLength(6);
    expect(parts.slice(0, 4)).toEqual(['scrypt', '65536', '8', '1']);
    expect(parts[4]).toMatch(/^[A-Za-z0-9_-]{22}$/); // 16-byte salt, base64url
    expect(parts[5]).toMatch(/^[A-Za-z0-9_-]{86}$/); // 64-byte key, base64url
  });

  it(
    'verifies the original password and rejects near-miss passwords',
    async () => {
      await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
      await expect(verifyPassword(`${PASSWORD} `, stored)).resolves.toBe(false);
      await expect(verifyPassword(PASSWORD.toUpperCase(), stored)).resolves.toBe(false);
    },
    SCRYPT_TIMEOUT_MS,
  );

  it('refuses non-string input without deriving a key', async () => {
    await expect(verifyPassword(12345678 as unknown as string, stored)).resolves.toBe(false);
    await expect(verifyPassword(undefined as unknown as string, stored)).resolves.toBe(false);
    await expect(hashPassword(12345678 as unknown as string)).rejects.toThrow(TypeError);
  });

  it(
    'salts each hash, so the same password never yields the same stored value',
    async () => {
      const other = await hashPassword(PASSWORD);
      expect(other).not.toBe(stored);
      expect(part(other, 4)).not.toBe(part(stored, 4));
    },
    SCRYPT_TIMEOUT_MS,
  );

  it('treats every malformed stored value as a failed sign-in', async () => {
    const accepted: string[] = [];
    for (const [label, mutate] of MALFORMED) {
      if (await verifyPassword(PASSWORD, mutate(stored))) accepted.push(label);
    }
    expect(accepted).toEqual([]);
  });

  it(
    'rejects cost fields that Number() accepts but the stored format does not allow',
    async () => {
      const variants = {
        hexadecimalN: withField(stored, 1, '0x10000'),
        fractionalN: withField(stored, 1, '65536.0'),
        exponentN: withField(stored, 1, '6.5536e4'),
        paddedR: withField(stored, 2, ' 8'),
      };
      const accepted: string[] = [];
      for (const [name, value] of Object.entries(variants)) {
        if (await verifyPassword(PASSWORD, value)) accepted.push(name);
      }
      expect(accepted).toEqual([]);
    },
    SCRYPT_TIMEOUT_MS,
  );

  it(
    'verifyAgainstDummyHash always resolves false, including for the placeholder password itself',
    async () => {
      await expect(
        verifyAgainstDummyHash('openmaic-timing-placeholder-not-a-password'),
      ).resolves.toBe(false);
      await expect(verifyAgainstDummyHash(PASSWORD)).resolves.toBe(false);
      await expect(verifyAgainstDummyHash(undefined as unknown as string)).resolves.toBe(false);
    },
    SCRYPT_TIMEOUT_MS,
  );
});

describe('password work queue', () => {
  it(
    'refuses derivations beyond the queue limit instead of queuing without bound',
    async () => {
      const stored = await hashPassword(PASSWORD);
      // Two run at once and sixty-four wait; the sixty-seventh is refused immediately.
      const outcomes = await Promise.all(
        Array.from({ length: 67 }, () =>
          verifyPassword('wrong password', stored).then(
            () => 'settled',
            (error: unknown) => error,
          ),
        ),
      );

      expect(outcomes.filter((outcome) => outcome instanceof PasswordWorkBusyError)).toHaveLength(
        1,
      );
      expect(outcomes.filter((outcome) => outcome === 'settled')).toHaveLength(66);
    },
    SCRYPT_TIMEOUT_MS * 4,
  );
});
