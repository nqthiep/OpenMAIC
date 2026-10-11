import { describe, expect, it } from 'vitest';

import { runAccountRoute } from '@/lib/server/accounts/http';
import { PasswordWorkBusyError } from '@/lib/server/accounts/password';

describe('account route failures', () => {
  it('answers a full password queue with 503 and a short retry hint', async () => {
    const response = await runAccountRoute(async () => {
      throw new PasswordWorkBusyError();
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('2');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'ACCOUNTS_BUSY',
    });
  });

  it('answers an unexpected failure with a generic 500 that carries no detail', async () => {
    const response = await runAccountRoute(async () => {
      throw new Error('connection string postgres://user:secret@db');
    });

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain('secret');
    expect(text).not.toContain('postgres://');
  });
});
