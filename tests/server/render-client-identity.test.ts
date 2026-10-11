import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const proxyFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/proxy-fetch', () => ({ proxyFetch }));

import { POST } from '@/app/api/export-video/render/route';

function submit(forwardedFor: string | undefined): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'multipart/form-data; boundary=x' };
  if (forwardedFor !== undefined) headers['x-forwarded-for'] = forwardedFor;
  return new NextRequest('http://localhost:3000/api/export-video/render', {
    method: 'POST',
    headers,
    body: 'archive-bytes',
  });
}

function upstreamClientHeader(): string | null {
  const init = proxyFetch.mock.calls[0]![1] as RequestInit;
  return new Headers(init.headers).get('x-openmaic-client');
}

beforeEach(() => {
  vi.stubEnv('RENDER_SERVICE_URL', 'http://render.internal:8080');
  proxyFetch.mockReset();
  proxyFetch.mockResolvedValue(
    new Response(JSON.stringify({ jobId: 'job-1' }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('render service client identity', () => {
  it('uses the last forwarded address, the one the nearest trusted proxy appended', async () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', 'true');

    await POST(submit('203.0.113.99, 198.51.100.7'));

    expect(upstreamClientHeader()).toBe('198.51.100.7');
  });

  it('does not let a client-supplied first entry choose its identity', async () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', 'true');

    await POST(submit('10.0.0.1, 10.0.0.2, 198.51.100.7'));

    expect(upstreamClientHeader()).toBe('198.51.100.7');
  });

  it('is direct when forwarded headers are not trusted', async () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', 'false');

    await POST(submit('198.51.100.7'));

    expect(upstreamClientHeader()).toBe('direct');
  });
});
