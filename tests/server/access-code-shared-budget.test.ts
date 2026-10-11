import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import {
  ACCESS_CODE_SHARED_MAX_FAILURES,
  ACCESS_CODE_SHARED_WINDOW_MS,
} from '@/lib/server/attempt-limiter';

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    set: mocks.cookieSet,
  }),
}));

const ACCESS_CODE = 'a'.repeat(32);
const MAX = ACCESS_CODE_SHARED_MAX_FAILURES;

type VerifyPost = (request: Request) => Promise<Response>;

/** Re-import the route so each test gets a fresh in-process limiter. */
async function loadPost(): Promise<VerifyPost> {
  vi.resetModules();
  const { POST } = await import('@/app/api/access-code/verify/route');
  return POST;
}

function verifyRequest(code: string): NextRequest {
  return new NextRequest('http://localhost/api/access-code/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

async function failTimes(POST: VerifyPost, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    expect((await POST(verifyRequest('wrong-code'))).status).toBe(401);
  }
}

beforeEach(() => {
  mocks.cookieSet.mockReset();
  process.env.ACCESS_CODE = ACCESS_CODE;
  delete process.env.TRUST_PROXY_HEADERS;
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ACCESS_CODE;
});

describe('POST /api/access-code/verify — shared budget without a trusted proxy', () => {
  it(`evaluates exactly ${MAX} of ${MAX + 40} concurrent wrong guesses`, async () => {
    const POST = await loadPost();

    const responses = await Promise.all(
      Array.from({ length: MAX + 40 }, () => POST(verifyRequest('wrong-code'))),
    );

    expect(responses.filter((res) => res.status === 401)).toHaveLength(MAX);
    expect(responses.filter((res) => res.status === 429)).toHaveLength(40);
  });

  it('accepts the correct code while one slot of the budget is left', async () => {
    const POST = await loadPost();
    await failTimes(POST, MAX - 1);

    expect((await POST(verifyRequest(ACCESS_CODE))).status).toBe(200);
  });

  it('answers 429 with a Retry-After inside the window and a Vietnamese message', async () => {
    const POST = await loadPost();
    await failTimes(POST, MAX);

    const res = await POST(verifyRequest('wrong-code'));

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get('retry-after'));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(ACCESS_CODE_SHARED_WINDOW_MS / 1000);
    expect((await res.json()).error).toBe('Quá nhiều lần nhập sai. Vui lòng thử lại sau.');
  });

  it('never spends the budget on correct codes', async () => {
    const POST = await loadPost();

    for (let i = 0; i < MAX + 40; i++) {
      expect((await POST(verifyRequest(ACCESS_CODE))).status).toBe(200);
    }
    await failTimes(POST, MAX);

    expect((await POST(verifyRequest('wrong-code'))).status).toBe(429);
  });

  it('refuses a correct code too once the budget is spent', async () => {
    const POST = await loadPost();
    await failTimes(POST, MAX);

    expect((await POST(verifyRequest(ACCESS_CODE))).status).toBe(429);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('frees a slot once the oldest failure leaves the window', async () => {
    const start = Date.parse('2026-10-10T08:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(start);
    const POST = await loadPost();
    await failTimes(POST, MAX);
    expect((await POST(verifyRequest('wrong-code'))).status).toBe(429);

    vi.setSystemTime(start + ACCESS_CODE_SHARED_WINDOW_MS + 1);

    expect((await POST(verifyRequest('wrong-code'))).status).toBe(401);
  });
});
