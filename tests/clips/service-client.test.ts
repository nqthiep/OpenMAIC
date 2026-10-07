import { describe, expect, it, vi } from 'vitest';
import { MAX_DOWNLOAD_BYTES, createManimClient } from '@/lib/clips/service-client';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function client(handler: Handler, timeoutMs?: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return handler(String(input), init ?? {});
  });
  const c = createManimClient({
    url: 'http://manim:8080/',
    token: 'tok',
    fetch: fakeFetch as unknown as typeof fetch,
    timeoutMs,
  });
  return { c, calls, fakeFetch };
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const REQ = { templateId: 'amgm-semicircle', templateRev: 1, params: { a: 2, b: 8 }, locale: null };

describe('submit', () => {
  it('sends the token, the owner id and the request, and returns the job', async () => {
    const { c, calls } = client(() => json(202, { jobId: 'j1', cacheKey: 'sha256:aa' }));
    expect(await c.submit(REQ, 'owner-7')).toEqual({
      kind: 'accepted',
      jobId: 'j1',
      cacheKey: 'sha256:aa',
    });
    expect(calls[0].url).toBe('http://manim:8080/render');
    expect(calls[0].init.method).toBe('POST');
    const h = calls[0].init.headers as Record<string, string>;
    expect(h['x-manim-token']).toBe('tok');
    expect(h['x-openmaic-client']).toBe('owner-7');
    expect(JSON.parse(calls[0].init.body as string)).toEqual(REQ);
  });

  it('maps every status of the contract to a value with a kind', async () => {
    const cases: [Response, unknown][] = [
      [json(400, { error: 'x' }), { kind: 'invalid-params' }],
      [json(401, {}), { kind: 'unauthorized' }],
      [json(404, {}), { kind: 'unknown-template' }],
      [json(429, { error: 'busy', reason: 'queue_full' }), { kind: 'busy', reason: 'queue_full' }],
      [
        json(429, { error: 'busy', reason: 'per_identity_limit' }),
        { kind: 'busy', reason: 'per_identity_limit' },
      ],
      [json(429, { error: 'busy' }), { kind: 'busy', reason: 'unknown' }],
      [json(500, {}), { kind: 'error', message: 'unexpected status 500' }],
      [
        json(202, { jobId: 'only' }),
        { kind: 'error', message: 'the service accepted the job but the reply has no jobId' },
      ],
    ];
    for (const [response, want] of cases) {
      const { c } = client(() => response.clone());
      expect(await c.submit(REQ, 'o')).toEqual(want);
    }
  });

  it('409 takes the current revision from the reply, or from /health when the reply has none', async () => {
    const withBody = client(() => json(409, { error: 'template-rev-mismatch', current: 3 }));
    expect(await withBody.c.submit(REQ, 'o')).toEqual({
      kind: 'template-rev-mismatch',
      current: 3,
    });
    const viaHealth = client((url) =>
      url.endsWith('/health')
        ? json(200, {
            accepting: true,
            imageDigest: 'sha256:i',
            templateRevs: { 'amgm-semicircle': 4 },
          })
        : json(409, { error: 'template-rev-mismatch' }),
    );
    expect(await viaHealth.c.submit(REQ, 'o')).toEqual({
      kind: 'template-rev-mismatch',
      current: 4,
    });
    expect(viaHealth.calls.map((x) => x.url)).toEqual([
      'http://manim:8080/render',
      'http://manim:8080/health',
    ]);
    const noHealth = client((url) => (url.endsWith('/health') ? json(500, {}) : json(409, {})));
    expect(await noHealth.c.submit(REQ, 'o')).toEqual({
      kind: 'template-rev-mismatch',
      current: null,
    });
  });

  it('never throws: a network error, a timeout and a body that is not JSON all become values', async () => {
    const down = client(() => {
      throw new Error('ECONNREFUSED');
    });
    expect(await down.c.submit(REQ, 'o')).toEqual({ kind: 'error', message: 'ECONNREFUSED' });
    const slow = client(
      (_u, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
      30,
    );
    expect(await slow.c.submit(REQ, 'o')).toEqual({
      kind: 'error',
      message: 'timeout after 30 ms',
    });
    const html = client(() => new Response('<html>', { status: 202 }));
    expect(await html.c.submit(REQ, 'o')).toMatchObject({ kind: 'error' });
  });
});

describe('status', () => {
  it('returns the status, clamps the progress and keeps the error text', async () => {
    const { c, calls } = client(() =>
      json(200, { status: 'failed', progress: 1.7, error: 'deadline' }),
    );
    expect(await c.status('j 1', 'o')).toEqual({
      kind: 'status',
      status: 'failed',
      progress: 1,
      error: 'deadline',
    });
    expect(calls[0].url).toBe('http://manim:8080/render/j%201'); // the id is encoded, never spliced into the path
  });

  it('accepts all five statuses, rejects an unknown one, and maps 404 and 401', async () => {
    for (const status of ['queued', 'running', 'succeeded', 'failed', 'cancelled']) {
      const { c } = client(() => json(200, { status, progress: 0.5 }));
      expect(await c.status('j', 'o')).toMatchObject({ kind: 'status', status, progress: 0.5 });
    }
    expect((await client(() => json(200, { status: 'exploded' })).c.status('j', 'o')).kind).toBe(
      'error',
    );
    expect(await client(() => json(404, {})).c.status('j', 'o')).toEqual({ kind: 'not-found' });
    expect(await client(() => json(401, {})).c.status('j', 'o')).toEqual({ kind: 'unauthorized' });
    expect(await client(() => json(200, { status: 'running' })).c.status('j', 'o')).toMatchObject({
      progress: 0,
    });
  });
});

describe('download', () => {
  it('returns the bytes and the content type of one chapter', async () => {
    const { c, calls } = client(
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        }),
    );
    const r = await c.download('j', 'height chapter', 'o');
    expect(r).toEqual({ kind: 'file', bytes: new Uint8Array([1, 2, 3]), contentType: 'video/mp4' });
    expect(calls[0].url).toBe('http://manim:8080/render/j/download?chapter=height%20chapter');
  });

  it('maps not ready, not found, unauthorized and refuses a file above the limit', async () => {
    expect(await client(() => json(409, {})).c.download('j', 'c', 'o')).toEqual({
      kind: 'not-ready',
    });
    expect(await client(() => json(404, {})).c.download('j', 'c', 'o')).toEqual({
      kind: 'not-found',
    });
    expect(await client(() => json(401, {})).c.download('j', 'c', 'o')).toEqual({
      kind: 'unauthorized',
    });
    const huge = client(
      () =>
        new Response('x', {
          status: 200,
          headers: { 'content-length': String(MAX_DOWNLOAD_BYTES + 1) },
        }),
    );
    expect(await huge.c.download('j', 'c', 'o')).toEqual({
      kind: 'error',
      message: 'the file is larger than the limit',
    });
  });
});

describe('cancel and health', () => {
  it('cancel: 204 is cancelled, 404 and errors are values', async () => {
    const { c, calls } = client(() => new Response(null, { status: 204 }));
    expect(await c.cancel('j', 'o')).toEqual({ kind: 'cancelled' });
    expect(calls[0].init.method).toBe('DELETE');
    expect(await client(() => json(404, {})).c.cancel('j', 'o')).toEqual({ kind: 'not-found' });
    expect(await client(() => json(500, {})).c.cancel('j', 'o')).toEqual({
      kind: 'error',
      message: 'unexpected status 500',
    });
  });

  it('health: keeps only the numeric template revisions, and sends the token but no owner', async () => {
    const { c, calls } = client(() =>
      json(200, { accepting: true, imageDigest: 'sha256:i', templateRevs: { a: 1, b: 'x', c: 3 } }),
    );
    expect(await c.health()).toEqual({
      kind: 'health',
      health: { accepting: true, imageDigest: 'sha256:i', templateRevs: { a: 1, c: 3 } },
    });
    const h = calls[0].init.headers as Record<string, string>;
    expect(h['x-manim-token']).toBe('tok');
    expect(h['x-openmaic-client']).toBeUndefined();
    expect(await client(() => json(200, { accepting: 'yes' })).c.health()).toMatchObject({
      health: { accepting: false, imageDigest: null, templateRevs: {} },
    });
    expect((await client(() => json(200, [1])).c.health()).kind).toBe('error');
  });
});
