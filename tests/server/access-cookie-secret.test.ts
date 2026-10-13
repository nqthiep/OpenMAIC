import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CODE = 'correct-code-123';
const SECRET = 'a-server-side-secret-of-at-least-32-chars';

const mocks = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: mocks.set }),
}));

describe('accessSigningKey', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs with the access code when no secret is configured', async () => {
    const { accessSigningKey } = await import('@/lib/server/access-token-policy');

    expect(accessSigningKey(CODE, undefined)).toBe(CODE);
    expect(accessSigningKey(CODE, '   ')).toBe(CODE);
  });

  it('signs with a secret of at least 32 characters, trimmed', async () => {
    const { accessSigningKey } = await import('@/lib/server/access-token-policy');

    expect(accessSigningKey(CODE, `  ${SECRET}  `)).toBe(SECRET);
  });

  it('ignores a short secret and warns once, rather than trusting it', async () => {
    const { accessSigningKey } = await import('@/lib/server/access-token-policy');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(accessSigningKey(CODE, 'too-short')).toBe(CODE);
    expect(accessSigningKey(CODE, 'too-short')).toBe(CODE);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('access cookie with ACCESS_COOKIE_SECRET', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.set.mockClear();
    vi.stubEnv('ACCESS_CODE', CODE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function gate(cookieValue: string) {
    const { proxy } = await import('@/proxy');
    return proxy(
      new NextRequest('http://localhost/api/stages', {
        headers: { cookie: `openmaic_access=${cookieValue}` },
      }),
    );
  }

  async function issuedCookie(): Promise<string> {
    const { POST } = await import('@/app/api/access-code/verify/route');
    const response = await POST(
      new Request('http://localhost/api/access-code/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: CODE }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.set).toHaveBeenCalledTimes(1);
    return String(mocks.set.mock.calls[0]?.[1]);
  }

  it('accepts a cookie the verify route issues, and refuses a code-only signature', async () => {
    vi.stubEnv('ACCESS_COOKIE_SECRET', SECRET);
    const { createAccessToken } = await import('@/lib/server/access-token');
    const codeOnly = createAccessToken(CODE);

    expect((await gate(await issuedCookie())).headers.get('x-middleware-next')).toBe('1');
    expect((await gate(codeOnly)).status).toBe(401);
  });

  it('keeps accepting code-signed cookies when no secret is configured', async () => {
    vi.stubEnv('ACCESS_COOKIE_SECRET', '');

    expect((await gate(await issuedCookie())).headers.get('x-middleware-next')).toBe('1');
  });
});
