import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountError } from '@/lib/server/accounts/service';
import { trustedClientKey, withClientBudget } from '@/lib/server/accounts/client-budget';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A key no other test shares, because the budget is process-wide. */
let counter = 0;
function freshKey(): string {
  counter += 1;
  return `203.0.113.${counter}`;
}

function failWith(code: 'INVALID_CREDENTIALS' | 'USERNAME_TAKEN' | 'RATE_LIMITED') {
  return async () => {
    throw new AccountError(code, 'refused');
  };
}

describe('trustedClientKey', () => {
  it('is undefined when forwarded headers are not trusted', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', 'false');
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.7' });

    expect(trustedClientKey(headers)).toBeUndefined();
  });

  it('uses the last forwarded entry when trusted, never the client-supplied first one', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', 'true');
    const headers = new Headers({ 'x-forwarded-for': '10.0.0.1, 198.51.100.7' });

    expect(trustedClientKey(headers)).toBe('198.51.100.7');
  });

  it('falls back to x-real-ip, then to one shared key, when trusted', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', 'true');

    expect(trustedClientKey(new Headers({ 'x-real-ip': '198.51.100.8' }))).toBe('198.51.100.8');
    expect(trustedClientKey(new Headers())).toBe('anonymous');
  });
});

describe('withClientBudget', () => {
  it('never refuses or counts an attempt when there is no client key', async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await expect(
        withClientBudget(undefined, 'INVALID_CREDENTIALS', failWith('INVALID_CREDENTIALS')),
      ).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    }
  });

  it('refuses the 31st counted failure from one client, and the refusal is RATE_LIMITED', async () => {
    const key = freshKey();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await expect(
        withClientBudget(key, 'INVALID_CREDENTIALS', failWith('INVALID_CREDENTIALS')),
      ).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    }

    const refused = await withClientBudget(key, 'INVALID_CREDENTIALS', async () => 'ran').catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(AccountError);
    expect(refused).toMatchObject({ code: 'RATE_LIMITED' });
    expect((refused as AccountError).retryAfterSeconds).toBeGreaterThan(0);
  });

  it('lets a class-sized run of successes through, since only failures are charged', async () => {
    const key = freshKey();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await expect(withClientBudget(key, 'INVALID_CREDENTIALS', async () => 'ok')).resolves.toBe(
        'ok',
      );
    }
  });

  it('does not charge failures with a different code', async () => {
    const key = freshKey();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await expect(
        withClientBudget(key, 'INVALID_CREDENTIALS', failWith('USERNAME_TAKEN')),
      ).rejects.toMatchObject({
        code: 'USERNAME_TAKEN',
      });
    }

    await expect(withClientBudget(key, 'INVALID_CREDENTIALS', async () => 'ok')).resolves.toBe(
      'ok',
    );
  });

  it('keeps one client budget separate from another', async () => {
    const spent = freshKey();
    const other = freshKey();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await withClientBudget(spent, 'USERNAME_TAKEN', failWith('USERNAME_TAKEN')).catch(() => {});
    }

    await expect(withClientBudget(other, 'USERNAME_TAKEN', async () => 'ok')).resolves.toBe('ok');
  });
  it('counts concurrent attempts from one client together, so the budget cannot be overshot', async () => {
    const key = freshKey();
    let started = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const attempt = async () => {
      started += 1;
      await gate;
      throw new AccountError('INVALID_CREDENTIALS', 'refused');
    };

    const runs = Array.from({ length: 40 }, () =>
      withClientBudget(key, 'INVALID_CREDENTIALS', attempt).catch((error: unknown) => error),
    );
    release();
    const outcomes = await Promise.all(runs);

    expect(started).toBe(30);
    expect(
      outcomes.filter((outcome) => (outcome as AccountError).code === 'RATE_LIMITED'),
    ).toHaveLength(10);
  });
});
