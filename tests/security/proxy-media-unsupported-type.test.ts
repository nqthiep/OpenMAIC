/**
 * The proxy answers an upstream that is not media with 415, a 4xx. The client's
 * session cache treats a 4xx as permanent, so the same URL is not fetched again.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { fetchProxiedMediaUrl, resetProxyMediaFailureCache } from '@/lib/media/proxy-media-cache';

const mocks = vi.hoisted(() => ({ validateUrlForSSRF: vi.fn(), upstreamFetch: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/server/ssrf-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/ssrf-guard')>()),
  validateUrlForSSRF: (...args: unknown[]) => mocks.validateUrlForSSRF(...args),
}));

// The route pulls in heavy dependencies; load it before the timed tests run.
beforeAll(async () => {
  await import('@/app/api/proxy-media/route');
}, 60_000);

beforeEach(() => {
  vi.resetAllMocks();
  resetProxyMediaFailureCache();
  mocks.validateUrlForSSRF.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a non-media upstream is a permanent refusal for the client', () => {
  it('answers 415 and does not request the URL again in the session', async () => {
    const { POST } = await import('@/app/api/proxy-media/route');
    mocks.upstreamFetch.mockResolvedValue(
      new Response('<html>page</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );
    // The client's call goes to the proxy route; every other fetch is the upstream.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/api/proxy-media') {
          return POST(
            new Request('http://localhost/api/proxy-media', init) as unknown as NextRequest,
          );
        }
        return mocks.upstreamFetch(input, init);
      }),
    );

    const first = await fetchProxiedMediaUrl('https://cdn.example.com/page');
    const second = await fetchProxiedMediaUrl('https://cdn.example.com/page');

    expect(first.status).toBe(415);
    expect(second.status).toBe(415);
    expect(mocks.upstreamFetch).toHaveBeenCalledTimes(1);
  });
});
