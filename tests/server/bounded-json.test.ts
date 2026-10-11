import { describe, expect, it } from 'vitest';

import { readBoundedJson } from '@/lib/server/bounded-json';

const LIMIT = 1024;

/** A body with no Content-Length, so only the streamed byte count can refuse it. */
function chunkedRequest(chunks: string[]): Request {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request('http://localhost/api/x', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit);
}

describe('readBoundedJson', () => {
  it('parses a body within the cap', async () => {
    const request = new Request('http://localhost/api/x', {
      method: 'POST',
      body: JSON.stringify({ stage: { id: 'a' } }),
    });

    await expect(readBoundedJson(request, LIMIT)).resolves.toEqual({
      ok: true,
      value: { stage: { id: 'a' } },
    });
  });

  it('refuses a declared length above the cap before reading the body', async () => {
    const request = new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-length': String(LIMIT + 1) },
      body: '{}',
    });

    await expect(readBoundedJson(request, LIMIT)).resolves.toEqual({
      ok: false,
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('counts a chunked body and refuses it once it passes the cap', async () => {
    const half = 'x'.repeat(LIMIT / 2 + 1);
    const request = chunkedRequest(['{"a":"', half, half, '"}']);

    await expect(readBoundedJson(request, LIMIT)).resolves.toEqual({
      ok: false,
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('answers 400 for text that is not JSON', async () => {
    const request = new Request('http://localhost/api/x', { method: 'POST', body: '{not json' });

    await expect(readBoundedJson(request, LIMIT)).resolves.toEqual({
      ok: false,
      status: 400,
      code: 'INVALID_JSON',
    });
  });

  it('answers 400 when there is no body', async () => {
    const request = new Request('http://localhost/api/x', { method: 'POST' });

    await expect(readBoundedJson(request, LIMIT)).resolves.toEqual({
      ok: false,
      status: 400,
      code: 'INVALID_JSON',
    });
  });
});
