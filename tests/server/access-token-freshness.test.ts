import { createHmac } from 'node:crypto';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_TOKEN_CLOCK_SKEW_MS,
  ACCESS_TOKEN_MAX_AGE_MS,
  isAccessTokenTimestampFresh,
} from '@/lib/server/access-token-policy';
import { createAccessToken, verifyAccessToken } from '@/lib/server/access-token';

const NOW = Date.parse('2026-10-01T12:00:00Z');

function signedToken(timestamp: string, accessCode: string): string {
  const signature = createHmac('sha256', accessCode).update(timestamp).digest('hex');
  return `${timestamp}.${signature}`;
}

describe('access token freshness policy', () => {
  it('accepts a timestamp minted now and refuses one older than the cookie lifetime', () => {
    expect(isAccessTokenTimestampFresh(String(NOW), NOW)).toBe(true);
    expect(isAccessTokenTimestampFresh(String(NOW - ACCESS_TOKEN_MAX_AGE_MS), NOW)).toBe(true);
    expect(isAccessTokenTimestampFresh(String(NOW - ACCESS_TOKEN_MAX_AGE_MS - 1), NOW)).toBe(false);
  });

  it('tolerates small future skew and refuses timestamps further ahead', () => {
    expect(isAccessTokenTimestampFresh(String(NOW + 30_000), NOW)).toBe(true);
    expect(isAccessTokenTimestampFresh(String(NOW + ACCESS_TOKEN_CLOCK_SKEW_MS + 1), NOW)).toBe(
      false,
    );
  });

  it.each(['', 'abc', '-1', '1.5', '1e12', '9999999999999999999', ' 123'])(
    'refuses a malformed timestamp %j',
    (timestamp) => {
      expect(isAccessTokenTimestampFresh(timestamp, NOW)).toBe(false);
    },
  );
});

describe('verifyAccessToken (Node verifier)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a fresh token and rejects it once it ages past the cookie lifetime', () => {
    const token = createAccessToken('demo-code');
    expect(verifyAccessToken(token, 'demo-code')).toBe(true);

    vi.setSystemTime(NOW + ACCESS_TOKEN_MAX_AGE_MS + 1);
    expect(verifyAccessToken(token, 'demo-code')).toBe(false);
  });

  it('refuses a correctly signed token whose timestamp is far in the future', () => {
    const token = signedToken(String(NOW + 60 * 60 * 1000), 'demo-code');
    expect(verifyAccessToken(token, 'demo-code')).toBe(false);
  });
});

describe('middleware access gate', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    process.env = { ...ORIGINAL_ENV, ACCESS_CODE: 'gate-code' };
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  async function runMiddleware(cookieValue?: string) {
    const { proxy } = await import('@/proxy');
    const headers: Record<string, string> = {};
    if (cookieValue !== undefined) headers.cookie = `openmaic_access=${cookieValue}`;
    return proxy(new NextRequest('http://localhost/api/stages', { headers }));
  }

  it('lets a request through with a fresh signed cookie and refuses an expired one', async () => {
    const fresh = signedToken(String(NOW), 'gate-code');
    const passed = await runMiddleware(fresh);
    expect(passed.status).toBe(200);
    expect(passed.headers.get('x-middleware-next')).toBe('1');

    vi.setSystemTime(NOW + ACCESS_TOKEN_MAX_AGE_MS + 1);
    const refused = await runMiddleware(fresh);
    expect(refused.status).toBe(401);
  });

  it('refuses a request without a cookie', async () => {
    const response = await runMiddleware();
    expect(response.status).toBe(401);
  });
});
