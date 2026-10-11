import { describe, expect, it, vi } from 'vitest';

// A failed native scrypt call (an allocation failure, in practice) must not look like a
// server bug to the client. It is a transient condition: busy, with a retry hint.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    scrypt: (
      _password: unknown,
      _salt: unknown,
      _keyLength: unknown,
      _options: unknown,
      callback: (error: Error | null, key?: Buffer) => void,
    ) => {
      callback(new Error('allocation failed inside the native scrypt call'));
    },
  };
});

import { runAccountRoute } from '@/lib/server/accounts/http';
import { hashPassword, PasswordWorkBusyError } from '@/lib/server/accounts/password';

describe('a failed scrypt call', () => {
  it('surfaces as a busy error that keeps the native reason for logs', async () => {
    const error = await hashPassword('correct horse battery staple').catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(PasswordWorkBusyError);
    expect((error as PasswordWorkBusyError).reason).toBeInstanceOf(Error);
  });

  it('answers 503 with a retry hint and no native detail in the body', async () => {
    const response = await runAccountRoute(async () => {
      await hashPassword('correct horse battery staple');
      return new Response('unreachable');
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('2');
    const text = await response.text();
    expect(text).toContain('ACCOUNTS_BUSY');
    expect(text).not.toContain('allocation failed');
  });
});
