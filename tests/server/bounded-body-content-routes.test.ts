// The stage, chat, generate and pbl routes read their JSON
// body through the shared bounded reader, so an oversized or endless body is
// refused with 413 before it is buffered. A body that is not JSON keeps each
// route's existing 400 answer.

import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/authz/viewer', () => ({
  requireSpender: async () => undefined,
  resolveViewer: async () => ({ ownerId: 'owner-1', role: 'learner' }),
}));

vi.mock('@/lib/config/feature-flags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config/feature-flags')>();
  return {
    ...actual,
    isAgentRuntimeConfigured: () => true,
    isServerPersistenceConfigured: () => true,
    resolveVocationalActive: () => false,
    isPiChatEnabled: () => true,
  };
});

vi.mock('@/lib/persistence/server-auth', () => ({
  resolveLearnerKeyForRequest: async () => 'key-1',
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: async () => ({
    model: { provider: 'test', modelId: 'test-model' },
    modelInfo: {},
    modelString: 'test:test-model',
    thinkingConfig: undefined,
    managedKey: false,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { POST as postStage } from '@/app/api/stages/route';
import { PATCH as patchStage, PUT as putStage } from '@/app/api/stages/[id]/route';
import { POST as postChatPi } from '@/app/api/chat/pi/route';
import { POST as postWhiteboardVisibility } from '@/app/api/chat/pi/whiteboard-visibility/route';
import { POST as postImage } from '@/app/api/generate/image/route';
import { POST as postVideo } from '@/app/api/generate/video/route';
import { POST as postTts } from '@/app/api/generate/tts/route';
import { POST as postVoice } from '@/app/api/generate/voice/route';
import { POST as postPblEvaluate } from '@/app/api/pbl/v2/evaluate/route';
import { POST as postPblInstructor } from '@/app/api/pbl/v2/instructor/route';
import { POST as postPblOpenTask } from '@/app/api/pbl/v2/open-task/route';
import { POST as postPblSimulator } from '@/app/api/pbl/v2/simulator/route';
import { POST as postPblTaskUpdate } from '@/app/api/pbl/v2/task/update/route';

const MIB = 1024 * 1024;
const TEN_MIB = 10 * 1024 * 1024;

interface BodyRoute {
  readonly name: string;
  readonly url: string;
  readonly call: (request: NextRequest) => Promise<Response>;
  /** Cap the route was given; also the expected `request body exceeds N bytes` value. */
  readonly maxBytes: number;
  /** The route's existing 400 answer for a body that is not JSON. */
  readonly invalidJson: { readonly errorCode: string; readonly error: string };
  /** A small valid-JSON body that the route's own validation refuses (proves the body gate passed). */
  readonly validButRejected: {
    readonly body: unknown;
    readonly errorCode: string;
    readonly error: string;
  };
}

type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

const stageParams = { params: Promise.resolve({ id: 'stage-1' }) };

const BODY_ROUTES: BodyRoute[] = [
  {
    name: 'POST /api/stages',
    url: 'http://localhost/api/stages',
    call: (request) => postStage(request),
    maxBytes: MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'invalid JSON body' },
    validButRejected: { body: {}, errorCode: 'MISSING_REQUIRED_FIELD', error: 'name is required' },
  },
  {
    name: 'PATCH /api/stages/[id]',
    url: 'http://localhost/api/stages/stage-1',
    call: (request) => patchStage(request, stageParams),
    maxBytes: MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'invalid JSON body' },
    validButRejected: {
      body: { name: '' },
      errorCode: 'INVALID_REQUEST',
      error: 'name must be a non-empty string',
    },
  },
  {
    name: 'PUT /api/stages/[id]',
    url: 'http://localhost/api/stages/stage-1',
    call: (request) => putStage(request, stageParams),
    maxBytes: TEN_MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'invalid JSON body' },
    validButRejected: {
      body: {},
      errorCode: 'INVALID_REQUEST',
      error: 'request body must be a stage document with `stage` and `scenes`',
    },
  },
  {
    name: 'POST /api/chat/pi',
    url: 'http://localhost/api/chat/pi',
    call: (request) => postChatPi(request),
    maxBytes: TEN_MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'request body must be valid JSON' },
    validButRejected: {
      body: {},
      errorCode: 'MISSING_REQUIRED_FIELD',
      error: 'Missing required field: messages',
    },
  },
  {
    name: 'POST /api/chat/pi/whiteboard-visibility',
    url: 'http://localhost/api/chat/pi/whiteboard-visibility',
    call: (request) => postWhiteboardVisibility(request),
    maxBytes: MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'Invalid whiteboard visibility response' },
    validButRejected: {
      body: {},
      errorCode: 'INVALID_REQUEST',
      error: 'Invalid whiteboard visibility response',
    },
  },
  {
    name: 'POST /api/generate/image',
    url: 'http://localhost/api/generate/image',
    call: (request) => postImage(request),
    maxBytes: MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'request body must be valid JSON' },
    validButRejected: {
      body: {},
      errorCode: 'MISSING_REQUIRED_FIELD',
      error: 'Missing prompt',
    },
  },
  {
    name: 'POST /api/generate/video',
    url: 'http://localhost/api/generate/video',
    call: (request) => postVideo(request),
    maxBytes: MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'request body must be valid JSON' },
    validButRejected: {
      body: {},
      errorCode: 'MISSING_REQUIRED_FIELD',
      error: 'Missing prompt',
    },
  },
  {
    name: 'POST /api/generate/tts',
    url: 'http://localhost/api/generate/tts',
    call: (request) => postTts(request),
    maxBytes: MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'request body must be valid JSON' },
    validButRejected: {
      body: {},
      errorCode: 'MISSING_REQUIRED_FIELD',
      error: 'Missing required fields: text, audioId (and a non-empty ttsVoice when sent)',
    },
  },
  {
    name: 'POST /api/generate/voice',
    url: 'http://localhost/api/generate/voice',
    call: (request) => postVoice(request),
    maxBytes: TEN_MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'request body must be valid JSON' },
    validButRejected: {
      body: {},
      errorCode: 'MISSING_REQUIRED_FIELD',
      error: 'voiceId is required',
    },
  },
  {
    name: 'POST /api/pbl/v2/evaluate',
    url: 'http://localhost/api/pbl/v2/evaluate',
    call: (request) => postPblEvaluate(request),
    maxBytes: MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'Request body must be valid JSON.' },
    validButRejected: {
      body: {},
      errorCode: 'MISSING_REQUIRED_FIELD',
      error: '`project` is required.',
    },
  },
  {
    name: 'POST /api/pbl/v2/instructor',
    url: 'http://localhost/api/pbl/v2/instructor',
    call: (request) => postPblInstructor(request),
    maxBytes: MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'Request body must be valid JSON.' },
    validButRejected: {
      body: {},
      errorCode: 'MISSING_REQUIRED_FIELD',
      error: '`project` is required.',
    },
  },
  {
    name: 'POST /api/pbl/v2/open-task',
    url: 'http://localhost/api/pbl/v2/open-task',
    call: (request) => postPblOpenTask(request),
    maxBytes: MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'Request body must be valid JSON.' },
    validButRejected: {
      body: {},
      errorCode: 'MISSING_REQUIRED_FIELD',
      error: '`project` is required.',
    },
  },
  {
    name: 'POST /api/pbl/v2/simulator',
    url: 'http://localhost/api/pbl/v2/simulator',
    call: (request) => postPblSimulator(request),
    maxBytes: MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'Request body must be valid JSON.' },
    validButRejected: {
      body: {},
      errorCode: 'MISSING_REQUIRED_FIELD',
      error: '`project` is required.',
    },
  },
  {
    name: 'POST /api/pbl/v2/task/update',
    url: 'http://localhost/api/pbl/v2/task/update',
    call: (request) => postPblTaskUpdate(request),
    maxBytes: MIB,
    invalidJson: { errorCode: 'INVALID_REQUEST', error: 'Request body must be valid JSON.' },
    validButRejected: {
      body: {},
      errorCode: 'MISSING_REQUIRED_FIELD',
      error: '`project` is required.',
    },
  },
];

function jsonRequest(route: BodyRoute, body: string): NextRequest {
  return new NextRequest(route.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

/** A body streamed in chunks with no Content-Length, so only the counted bytes can refuse it. */
function chunkedRequest(route: BodyRoute, chunks: string[]): NextRequest {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new NextRequest(route.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as NextRequestInit);
}

/** A body that counts the reads requested from it. Nothing is produced until a read arrives. */
function countedRequest(route: BodyRoute, declaredLength: number) {
  let reads = 0;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        reads += 1;
        controller.enqueue(encoder.encode('{}'));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const request = new NextRequest(route.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(declaredLength) },
    body: stream,
    duplex: 'half',
  } as NextRequestInit);
  return { request, reads: () => reads };
}

describe.each(BODY_ROUTES)('$name bounded body', (route) => {
  const tooLarge = {
    success: false,
    errorCode: 'PAYLOAD_TOO_LARGE',
    error: `request body exceeds ${route.maxBytes} bytes`,
  };

  it('answers 413 for a declared length over the cap without reading the body', async () => {
    const { request, reads } = countedRequest(route, route.maxBytes + 1);

    const response = await route.call(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual(tooLarge);
    expect(reads()).toBe(0);
  });

  it('answers 413 for a chunked body that passes the cap', async () => {
    const half = 'x'.repeat(route.maxBytes / 2 + 1);

    const response = await route.call(chunkedRequest(route, ['{"text":"', half, half, '"}']));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual(tooLarge);
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await route.call(jsonRequest(route, '{not json'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      errorCode: route.invalidJson.errorCode,
      error: route.invalidJson.error,
    });
  });

  it('passes a small valid body to the route instead of refusing it', async () => {
    const response = await route.call(
      jsonRequest(route, JSON.stringify(route.validButRejected.body)),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      errorCode: route.validButRejected.errorCode,
      error: route.validButRejected.error,
    });
  });
});
