import { describe, expect, it } from 'vitest';

import { createSSEResponse, type PBLSSEEvent } from '@/lib/pbl/v2/api/sse';
import { MODEL_FAILURE_TEXT } from '@/lib/server/error-summary';

const UPSTREAM_TEXT = 'upstream rejected the request with status 401';

async function* emitEvents(...events: PBLSSEEvent[]): AsyncGenerator<PBLSSEEvent, void, void> {
  yield* events;
}

async function* failAfterToken(thrown: unknown): AsyncGenerator<PBLSSEEvent, void, void> {
  yield { type: 'token', delta: 'partial' };
  throw thrown;
}

function parseFrames(body: string): Array<{ event: string; data: Record<string, unknown> }> {
  return body
    .split('\n\n')
    .filter((frame) => frame.startsWith('event: '))
    .map((frame) => {
      const [eventLine, dataLine] = frame.split('\n');
      return {
        event: eventLine.slice('event: '.length),
        data: JSON.parse(dataLine.slice('data: '.length)) as Record<string, unknown>,
      };
    });
}

describe('PBL SSE error text', () => {
  it("replaces error event messages with the fixed text under the operator's key", async () => {
    const response = createSSEResponse(
      emitEvents(
        { type: 'token', delta: 'hi' },
        { type: 'error', code: 'LLM_ERROR', message: UPSTREAM_TEXT },
        { type: 'done' },
      ),
      { managedKey: true },
    );

    expect(parseFrames(await response.text())).toEqual([
      { event: 'token', data: { delta: 'hi' } },
      { event: 'error', data: { code: 'LLM_ERROR', message: MODEL_FAILURE_TEXT } },
      { event: 'done', data: {} },
    ]);
  });

  it("keeps the upstream message in error events under a visitor's key", async () => {
    const response = createSSEResponse(
      emitEvents({ type: 'error', code: 'LLM_ERROR', message: UPSTREAM_TEXT }, { type: 'done' }),
      { managedKey: false },
    );

    expect(parseFrames(await response.text())).toEqual([
      { event: 'error', data: { code: 'LLM_ERROR', message: UPSTREAM_TEXT } },
      { event: 'done', data: {} },
    ]);
  });

  it("replaces a thrown error's message with the fixed text under the operator's key", async () => {
    const body = await createSSEResponse(failAfterToken(new Error(UPSTREAM_TEXT)), {
      managedKey: true,
    }).text();

    expect(parseFrames(body)).toEqual([
      { event: 'token', data: { delta: 'partial' } },
      { event: 'error', data: { code: 'STREAM_ERROR', message: MODEL_FAILURE_TEXT } },
      { event: 'done', data: {} },
    ]);
    expect(body).not.toContain(UPSTREAM_TEXT);
  });

  it("keeps a thrown error's message under a visitor's key, including non-Error values", async () => {
    const fromError = await createSSEResponse(failAfterToken(new Error(UPSTREAM_TEXT)), {
      managedKey: false,
    }).text();
    const fromValue = await createSSEResponse(failAfterToken('plain failure'), {
      managedKey: false,
    }).text();

    expect(parseFrames(fromError)[1]).toEqual({
      event: 'error',
      data: { code: 'STREAM_ERROR', message: UPSTREAM_TEXT },
    });
    expect(parseFrames(fromValue)[1]).toEqual({
      event: 'error',
      data: { code: 'STREAM_ERROR', message: 'plain failure' },
    });
  });
});
