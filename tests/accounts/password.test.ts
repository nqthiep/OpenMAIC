import { describe, expect, it } from 'vitest';

import {
  dummyPasswordHash,
  generateTemporaryPassword,
  hashPassword,
  normalizePassword,
  passwordProblem,
  verifyPassword,
} from '@/lib/accounts/password';

describe('password hashing', () => {
  it('stores scrypt with its cost, a 16-byte salt and a 64-byte key', async () => {
    const hash = await hashPassword('correct horse battery');
    const parts = hash.split('$');
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe('scrypt');
    expect(Number(parts[1])).toBe(32768);
    expect(Buffer.from(parts[4] ?? '', 'base64url')).toHaveLength(16);
    expect(Buffer.from(parts[5] ?? '', 'base64url')).toHaveLength(64);
  });

  it('verifies the right password and refuses a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batter', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    const first = await hashPassword('same password here');
    const second = await hashPassword('same password here');
    expect(first).not.toBe(second);
  });

  it('treats composed and decomposed Vietnamese as one password', async () => {
    const composed = 'mật khẩu của tôi'.normalize('NFC');
    const decomposed = composed.normalize('NFD');
    expect(normalizePassword(decomposed)).toBe(normalizePassword(composed));
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it('refuses a malformed or tampered stored hash without throwing', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('anything', 'bcrypt$1$2$3$x$y')).toBe(false);
    expect(await verifyPassword('correct horse battery', hash.replace(/\$[^$]+$/, '$AAAA'))).toBe(
      false,
    );
    expect(await verifyPassword('correct horse battery', hash.replace('$32768$', '$3$'))).toBe(
      false,
    );
  });

  it('the dummy hash costs the same as a real one and never matches', async () => {
    const dummy = await dummyPasswordHash();
    expect(dummy.split('$')[1]).toBe('32768');
    expect(await verifyPassword('anything at all', dummy)).toBe(false);
  });
});

describe('password policy', () => {
  it('refuses 9 characters and 201 characters, accepts 10 and 200', () => {
    expect(passwordProblem('a'.repeat(9), 'alice')).toBe('length');
    expect(passwordProblem('a'.repeat(201), 'alice')).toBe('length');
    expect(passwordProblem('a'.repeat(10), 'alice')).toBeUndefined();
    expect(passwordProblem('b'.repeat(200), 'alice')).toBeUndefined();
  });

  it('counts code points, not UTF-16 units', () => {
    expect(passwordProblem('😀'.repeat(10), 'alice')).toBeUndefined();
    expect(passwordProblem('😀'.repeat(9), 'alice')).toBe('length');
  });

  it('refuses a password that contains the username, in any case', () => {
    expect(passwordProblem('my-ALICE-pass', 'alice')).toBe('username');
  });

  it.each(['password1234', 'qwertyuiop', 'matkhau12345', 'openmaic1234'])(
    'refuses the common password %s',
    (password) => {
      expect(passwordProblem(password, 'someone')).toBe('common');
    },
  );
});

describe('temporary passwords', () => {
  it('meet the policy and use no look-alike characters', () => {
    const shape =
      /^[abcdefghjkmnpqrstuvwxyz23456789]{4}(-[abcdefghjkmnpqrstuvwxyz23456789]{4}){3}$/;
    for (let index = 0; index < 50; index += 1) {
      const password = generateTemporaryPassword('alice');
      expect(password).toMatch(shape);
      expect(passwordProblem(password, 'alice')).toBeUndefined();
    }
  });
});
