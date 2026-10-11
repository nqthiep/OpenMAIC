import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: vi.fn() })),
}));

const WINDOW_MS = 15 * 60 * 1000;

function guess(code: string): Request {
  return new Request('http://localhost/api/access-code/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

describe('POST /api/access-code/verify failure throttle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    vi.stubEnv('ACCESS_CODE', 'correct-code');
    vi.stubEnv('TRUST_PROXY_HEADERS', '');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('refuses guesses after ten failures until the window passes', async () => {
    const { POST } = await import('@/app/api/access-code/verify/route');

    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await POST(guess('wrong'))).status).toBe(401);
    }
    const blocked = await POST(guess('wrong'));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await POST(guess('correct-code'))).status).toBe(429);

    vi.advanceTimersByTime(WINDOW_MS + 1);
    expect((await POST(guess('correct-code'))).status).toBe(200);
  });

  it('clears earlier failures after a correct code', async () => {
    const { POST } = await import('@/app/api/access-code/verify/route');

    for (let attempt = 0; attempt < 9; attempt++) {
      expect((await POST(guess('wrong'))).status).toBe(401);
    }
    expect((await POST(guess('correct-code'))).status).toBe(200);

    for (let attempt = 0; attempt < 9; attempt++) {
      expect((await POST(guess('wrong'))).status).toBe(401);
    }
  });

  it('keeps accepting requests when no access code is configured', async () => {
    vi.stubEnv('ACCESS_CODE', '');
    const { POST } = await import('@/app/api/access-code/verify/route');

    expect((await POST(guess('anything'))).status).toBe(200);
  });

  it('bounds simultaneous wrong guesses by the failure budget', async () => {
    const { POST } = await import('@/app/api/access-code/verify/route');

    const responses = await Promise.all(Array.from({ length: 15 }, () => POST(guess('wrong'))));
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 401)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
  });

  it('answers a JSON null body as a failed guess, not a server error', async () => {
    const { POST } = await import('@/app/api/access-code/verify/route');
    const nullBody = new Request('http://localhost/api/access-code/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'null',
    });

    expect((await POST(nullBody)).status).toBe(401);
  });

  it('keys the limit by the last forwarded address the trusted proxy appended', async () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', 'true');
    const { POST } = await import('@/app/api/access-code/verify/route');
    const forwardedGuess = (prefix: string) =>
      new Request('http://localhost/api/access-code/verify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `${prefix}, 203.0.113.9`,
        },
        body: JSON.stringify({ code: 'wrong' }),
      });

    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await POST(forwardedGuess(`198.51.100.${attempt}`))).status).toBe(401);
    }
    // A fresh first entry does not reset the limit: the proxy-added last entry is the same.
    expect((await POST(forwardedGuess('192.0.2.77'))).status).toBe(429);
  });
});
