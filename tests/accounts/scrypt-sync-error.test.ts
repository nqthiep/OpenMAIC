import { describe, expect, it, vi } from 'vitest';

// A synchronous rejection from the native call (invalid or over-limit parameters) is a
// server fault. It must not be reported as a busy queue, which tells clients to retry.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    scrypt: () => {
      throw new RangeError('Invalid scrypt params: memory limit exceeded');
    },
  };
});

import { runAccountRoute } from '@/lib/server/accounts/http';
import { hashPassword, PasswordWorkBusyError } from '@/lib/server/accounts/password';

describe('a synchronous scrypt rejection', () => {
  it('is not reported as a busy queue', async () => {
    const error = await hashPassword('correct horse battery staple').catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(RangeError);
    expect(error).not.toBeInstanceOf(PasswordWorkBusyError);
  });

  it('answers 500 without the native message in the body', async () => {
    const response = await runAccountRoute(async () => {
      await hashPassword('correct horse battery staple');
      return new Response('unreachable');
    });

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain('memory limit');
  });
});
