/**
 * A failed Pi chat turn answers with a fixed message. The cause (a model
 * error, a secret in a provider config, a rejected reference or web search
 * setting) stays in the server log and never reaches the client.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const SECRET = 'sk-leaked-9f2c';
const CHAT_FAILED_MESSAGE = 'Không thể xử lý yêu cầu, vui lòng thử lại.';
const ENV_NAMES = [
  'NEXT_PUBLIC_PI_CHAT_ENABLED',
  'NEXT_PUBLIC_COURSEWARE_REFERENCE_ENABLED',
  'OPENMAIC_ENABLE_PI_NATIVE_CHILD_RUNTIME',
];
const originalEnv = new Map<string, string | undefined>();

const mocks = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  runPiDirectorLoop: vi.fn(),
  resolveClassroomWebSearchConfig: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/server/resolve-model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/resolve-model')>()),
  resolveModel: (...args: unknown[]) => mocks.resolveModel(...args),
}));
vi.mock('@/lib/ai/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/providers')>()),
  isProviderKeyRequired: () => false,
}));
vi.mock('@/lib/chat/pi/director-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chat/pi/director-loop')>()),
  runPiDirectorLoop: (...args: unknown[]) => mocks.runPiDirectorLoop(...args),
}));
vi.mock('@/lib/server/web-search-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/web-search-config')>()),
  resolveClassroomWebSearchConfig: (...args: unknown[]) =>
    mocks.resolveClassroomWebSearchConfig(...args),
}));

function chatRequest(extra: Record<string, unknown> = {}): NextRequest {
  const body = {
    messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
    storeState: {
      stage: { id: 'stage-1', name: 'City Cooling', whiteboard: [] },
      scenes: [
        {
          id: 'scene-1',
          title: 'Cooling',
          type: 'slide',
          content: { type: 'slide', canvas: { elements: [] } },
        },
      ],
      currentSceneId: 'scene-1',
      mode: 'autonomous',
      whiteboardOpen: false,
    },
    config: {
      agentIds: ['teacher'],
      agentConfigs: [
        {
          id: 'teacher',
          name: 'Teacher',
          role: 'teacher',
          persona: 'You teach clearly.',
          priority: 10,
          avatar: '',
          color: '#3366ff',
          allowedActions: [],
        },
      ],
    },
    apiKey: 'client-key',
    model: 'client:model',
    ...extra,
  };
  return new Request('http://localhost/api/chat/pi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

// The route pulls in heavy dependencies; load it before the timed tests run.
beforeAll(async () => {
  await import('@/app/api/chat/pi/route');
}, 60_000);

beforeEach(() => {
  for (const name of ENV_NAMES) originalEnv.set(name, process.env[name]);
  process.env.NEXT_PUBLIC_PI_CHAT_ENABLED = 'true';
  vi.resetAllMocks();
  mocks.resolveModel.mockResolvedValue({
    model: { id: 'language-model' },
    apiKey: 'client-key',
    providerId: 'test-provider',
    modelInfo: { outputWindow: 4096 },
    thinkingConfig: { enabled: false },
  });
  mocks.runPiDirectorLoop.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('POST /api/chat/pi failure answers', () => {
  it('sends the fixed message in the SSE error event, not the cause', async () => {
    mocks.runPiDirectorLoop.mockRejectedValue(new Error(`upstream rejected ${SECRET}`));
    const { POST } = await import('@/app/api/chat/pi/route');

    const text = await (await POST(chatRequest())).text();

    expect(text).toContain(`"message":"${CHAT_FAILED_MESSAGE}"`);
    expect(text).not.toContain(SECRET);
  });

  it('answers a failure before streaming with a fixed INTERNAL_ERROR body', async () => {
    mocks.resolveModel.mockRejectedValue(new Error(`provider config ${SECRET}`));
    const { POST } = await import('@/app/api/chat/pi/route');

    const res = await POST(chatRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'INTERNAL_ERROR',
      error: CHAT_FAILED_MESSAGE,
    });
  });

  it('answers a rejected element reference with the fixed message and a 400', async () => {
    process.env.NEXT_PUBLIC_COURSEWARE_REFERENCE_ENABLED = 'true';
    const { POST } = await import('@/app/api/chat/pi/route');

    const res = await POST(chatRequest({ elementReference: 'not-an-object' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'INVALID_REQUEST',
      error: CHAT_FAILED_MESSAGE,
    });
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('answers a rejected web search configuration with the fixed message and a 400', async () => {
    process.env.OPENMAIC_ENABLE_PI_NATIVE_CHILD_RUNTIME = 'true';
    mocks.resolveClassroomWebSearchConfig.mockRejectedValue(
      new Error(`Unsupported Tavily base URL: https://evil.example.com/${SECRET}`),
    );
    const { POST } = await import('@/app/api/chat/pi/route');

    const res = await POST(chatRequest({ webSearchBaseUrl: `https://evil.example.com/${SECRET}` }));
    const text = await res.text();

    expect(res.status).toBe(400);
    expect(JSON.parse(text)).toEqual({
      success: false,
      errorCode: 'INVALID_REQUEST',
      error: CHAT_FAILED_MESSAGE,
    });
    expect(text).not.toContain(SECRET);
    expect(mocks.runPiDirectorLoop).not.toHaveBeenCalled();
  });
});
