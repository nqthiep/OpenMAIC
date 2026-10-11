/**
 * Byte caps on the upload routes and the media proxy.
 *
 * An upload is refused from its declared Content-Length before anything reads
 * it, and a body that omits or understates the length is cut off once it passes
 * the cap. The media proxy streams its upstream body under a cap and refuses
 * types that are not media or fonts, without reading them.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { fetchProxiedMediaUrl, resetProxyMediaFailureCache } from '@/lib/media/proxy-media-cache';

const MIB = 1024 * 1024;
const UPLOAD_CAP = 50 * MIB;
const PROXY_CAP = 25 * MIB;

const mocks = vi.hoisted(() => ({ validateUrlForSSRF: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/server/ssrf-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/ssrf-guard')>()),
  validateUrlForSSRF: (...args: unknown[]) => mocks.validateUrlForSSRF(...args),
}));

interface Counter {
  pulls: number;
  cancelled: boolean;
}

/** A multipart body whose file part never ends; the counter records how far it was read. */
function endlessMultipart(field: string, counter: Counter): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(MIB).fill(0x41);
  const head =
    `--b\r\nContent-Disposition: form-data; name="${field}"; filename="a.bin"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n';
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(head));
    },
    pull(controller) {
      counter.pulls += 1;
      controller.enqueue(chunk);
    },
    cancel() {
      counter.cancelled = true;
    },
  });
}

function uploadRequest(
  url: string,
  body: ReadableStream<Uint8Array>,
  declared?: number,
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'multipart/form-data; boundary=b' };
  if (declared !== undefined) headers['Content-Length'] = String(declared);
  return new Request(url, {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit) as unknown as NextRequest;
}

async function postProxy(url: string): Promise<Response> {
  const { POST } = await import('@/app/api/proxy-media/route');
  return POST(
    new Request('http://localhost/api/proxy-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }) as unknown as NextRequest,
  );
}

// The routes pull in heavy dependencies; load them before the timed tests run.
beforeAll(async () => {
  await Promise.all([
    import('@/app/api/parse-pdf/route'),
    import('@/app/api/transcription/route'),
    import('@/app/api/proxy-media/route'),
  ]);
}, 60_000);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.validateUrlForSSRF.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('upload byte caps', () => {
  it('parse-pdf refuses a declared oversize body without reading it', async () => {
    const counter: Counter = { pulls: 0, cancelled: false };
    const { POST } = await import('@/app/api/parse-pdf/route');

    const res = await POST(
      uploadRequest(
        'http://localhost/api/parse-pdf',
        endlessMultipart('pdf', counter),
        UPLOAD_CAP + 1,
      ),
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ errorCode: 'INVALID_REQUEST' });
    expect(counter.pulls).toBe(0);
  });

  it('transcription refuses a declared oversize body without reading it', async () => {
    const counter: Counter = { pulls: 0, cancelled: false };
    const { POST } = await import('@/app/api/transcription/route');

    const res = await POST(
      uploadRequest(
        'http://localhost/api/transcription',
        endlessMultipart('audio', counter),
        UPLOAD_CAP + 1,
      ),
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ errorCode: 'INVALID_REQUEST' });
    expect(counter.pulls).toBe(0);
  });

  it('parse-pdf stops a body with no Content-Length once it passes the cap', async () => {
    const counter: Counter = { pulls: 0, cancelled: false };
    const { POST } = await import('@/app/api/parse-pdf/route');

    const res = await POST(
      uploadRequest('http://localhost/api/parse-pdf', endlessMultipart('pdf', counter)),
    );

    expect(res.status).toBe(413);
    expect(counter.cancelled).toBe(true);
    expect(counter.pulls).toBeLessThanOrEqual(UPLOAD_CAP / MIB + 3);
  });

  it('transcription stops a body with no Content-Length once it passes the cap', async () => {
    const counter: Counter = { pulls: 0, cancelled: false };
    const { POST } = await import('@/app/api/transcription/route');

    const res = await POST(
      uploadRequest('http://localhost/api/transcription', endlessMultipart('audio', counter)),
    );

    expect(res.status).toBe(413);
    expect(counter.cancelled).toBe(true);
    expect(counter.pulls).toBeLessThanOrEqual(UPLOAD_CAP / MIB + 3);
  });
});

describe('media proxy limits', () => {
  it('stops an upstream body past the cap and cancels it', async () => {
    const counter: Counter = { pulls: 0, cancelled: false };
    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        counter.pulls += 1;
        controller.enqueue(new Uint8Array(MIB));
      },
      cancel() {
        counter.cancelled = true;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(upstream, { status: 200, headers: { 'Content-Type': 'image/png' } }),
        ),
    );

    const res = await postProxy('https://cdn.example.com/huge.png');

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ errorCode: 'UPSTREAM_ERROR' });
    expect(counter.cancelled).toBe(true);
    expect(counter.pulls).toBeLessThanOrEqual(PROXY_CAP / MIB + 2);
  });

  it('does not ask the upstream for an oversize asset again in the session', async () => {
    resetProxyMediaFailureCache();
    const upstreamFetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(new Uint8Array(MIB));
            },
          }),
          { status: 200, headers: { 'Content-Type': 'image/png' } },
        ),
    );
    // The client's call goes to the proxy route; every other fetch is the upstream.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input === '/api/proxy-media') {
          const { POST } = await import('@/app/api/proxy-media/route');
          return POST(
            new Request('http://localhost/api/proxy-media', init) as unknown as NextRequest,
          );
        }
        return upstreamFetch();
      }),
    );

    const first = await fetchProxiedMediaUrl('https://cdn.example.com/huge-client.png');
    const second = await fetchProxiedMediaUrl('https://cdn.example.com/huge-client.png');

    expect(first.status).toBe(413);
    expect(second.status).toBe(413);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it('refuses a markup or text body without reading it', async () => {
    const counter: Counter = { pulls: 0, cancelled: false };
    // highWaterMark 0: no pull happens until someone reads, so `pulls` counts reads only.
    const upstream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          counter.pulls += 1;
          controller.enqueue(new TextEncoder().encode('<html>page</html>'));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(upstream, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      ),
    );

    const res = await postProxy('https://cdn.example.com/page');

    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ errorCode: 'UPSTREAM_ERROR' });
    expect(counter.pulls).toBe(0);
  });

  it.each([
    'image/png',
    'image/svg+xml',
    'video/mp4',
    'audio/mpeg',
    'font/woff2',
    'application/font-woff',
    'application/x-font-ttf',
    'application/octet-stream',
  ])('still serves %s', async (type) => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(bytes, { status: 200, headers: { 'Content-Type': type } })),
    );

    const res = await postProxy('https://cdn.example.com/asset');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(type);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });
});
