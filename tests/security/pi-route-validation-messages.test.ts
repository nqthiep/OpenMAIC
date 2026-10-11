/**
 * A request that fails validation on POST /api/chat/pi gets the fixed message.
 * The field name or the agent id the client sent stays in the server log only.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const CHAT_FAILED_MESSAGE = 'Không thể xử lý yêu cầu, vui lòng thử lại.';
const UNKNOWN_AGENT = 'ghost-agent-7f3a';
const ENV_NAMES = ['NEXT_PUBLIC_PI_CHAT_ENABLED', 'NEXT_PUBLIC_COURSEWARE_REFERENCE_ENABLED'];
const originalEnv = new Map<string, string | undefined>();

const mocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  resolveModel: vi.fn(),
  runPiDirectorLoop: vi.fn(),
  isProviderKeyRequired: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ createLogger: () => mocks.logger }));
vi.mock('@/lib/server/resolve-model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/resolve-model')>()),
  resolveModel: (...args: unknown[]) => mocks.resolveModel(...args),
}));
vi.mock('@/lib/ai/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/providers')>()),
  isProviderKeyRequired: (...args: unknown[]) => mocks.isProviderKeyRequired(...args),
}));
vi.mock('@/lib/chat/pi/director-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chat/pi/director-loop')>()),
  runPiDirectorLoop: (...args: unknown[]) => mocks.runPiDirectorLoop(...args),
}));

const teacher = {
  id: 'teacher',
  name: 'Teacher',
  role: 'teacher',
  persona: 'You teach clearly.',
  priority: 10,
  avatar: '',
  color: '#3366ff',
  allowedActions: [],
};

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
    config: { agentIds: ['teacher'], agentConfigs: [teacher] },
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

describe('POST /api/chat/pi validation answers', () => {
  it.each([
    ['messages', { messages: undefined }],
    ['storeState', { storeState: undefined }],
    ['config.agentIds', { config: { agentConfigs: [teacher] } }],
  ])('answers a missing %s with the fixed message and logs the field', async (field, extra) => {
    const { POST } = await import('@/app/api/chat/pi/route');

    const res = await POST(chatRequest(extra));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'MISSING_REQUIRED_FIELD',
      error: CHAT_FAILED_MESSAGE,
    });
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.stringContaining(field));
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('answers an unknown agent id with the fixed message and keeps the id out of the body', async () => {
    const { POST } = await import('@/app/api/chat/pi/route');

    const res = await POST(
      chatRequest({ config: { agentIds: ['teacher', UNKNOWN_AGENT], agentConfigs: [teacher] } }),
    );
    const text = await res.text();

    expect(res.status).toBe(400);
    expect(JSON.parse(text)).toEqual({
      success: false,
      errorCode: 'INVALID_REQUEST',
      error: CHAT_FAILED_MESSAGE,
    });
    expect(text).not.toContain(UNKNOWN_AGENT);
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.stringContaining(UNKNOWN_AGENT));
    expect(mocks.runPiDirectorLoop).not.toHaveBeenCalled();
  });

  it('answers a malformed agentIds list with the fixed message before resolving a model', async () => {
    const { POST } = await import('@/app/api/chat/pi/route');

    const res = await POST(
      chatRequest({ config: { agentIds: ['teacher', 'teacher'], agentConfigs: [teacher] } }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'INVALID_REQUEST',
      error: CHAT_FAILED_MESSAGE,
    });
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('answers the disabled runtime with the fixed message and a 404', async () => {
    process.env.NEXT_PUBLIC_PI_CHAT_ENABLED = 'false';
    const { POST } = await import('@/app/api/chat/pi/route');

    const res = await POST(chatRequest());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'INVALID_REQUEST',
      error: CHAT_FAILED_MESSAGE,
    });
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('answers courseware references sent while they are off with the fixed message', async () => {
    process.env.NEXT_PUBLIC_COURSEWARE_REFERENCE_ENABLED = 'false';
    const { POST } = await import('@/app/api/chat/pi/route');

    const res = await POST(
      chatRequest({
        elementReference: { kind: 'slide_element', sceneId: 'scene-1', elementId: 'text-1' },
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'INVALID_REQUEST',
      error: CHAT_FAILED_MESSAGE,
    });
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('courseware references are disabled'),
    );
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('answers a missing provider key with the fixed message and a 401', async () => {
    mocks.isProviderKeyRequired.mockReturnValue(true);
    mocks.resolveModel.mockResolvedValue({
      model: { id: 'language-model' },
      apiKey: undefined,
      providerId: 'test-provider',
    });
    const { POST } = await import('@/app/api/chat/pi/route');

    const res = await POST(chatRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'MISSING_API_KEY',
      error: CHAT_FAILED_MESSAGE,
    });
    expect(mocks.runPiDirectorLoop).not.toHaveBeenCalled();
  });
});
