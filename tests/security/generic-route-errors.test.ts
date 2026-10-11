/**
 * A failed route answers with a fixed, user-facing message. The raw
 * `error.message` can carry keys, file paths or upstream bodies, so it stays in
 * the server log and never reaches the client.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const SECRET = 'sk-leaked-9f2c';
const CHAT_MESSAGE = 'Không thể xử lý yêu cầu, vui lòng thử lại.';
const PDF_MESSAGE = 'Không thể đọc tệp PDF, vui lòng thử lại.';
const ASR_MESSAGE = 'Không thể nhận dạng giọng nói, vui lòng thử lại.';
const PROXY_MESSAGE = 'Không thể tải tệp đa phương tiện, vui lòng thử lại.';

const mocks = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  statelessGenerate: vi.fn(),
  extractDocument: vi.fn(),
  resolveMediaSlot: vi.fn(),
  transcribeAudio: vi.fn(),
  validateUrlForSSRF: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/server/resolve-model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/resolve-model')>()),
  resolveModel: (...args: unknown[]) => mocks.resolveModel(...args),
}));
vi.mock('@/lib/orchestration/stateless-generate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orchestration/stateless-generate')>()),
  statelessGenerate: (...args: unknown[]) => mocks.statelessGenerate(...args),
}));
vi.mock('@/lib/ai/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/providers')>()),
  isProviderKeyRequired: () => false,
}));
vi.mock('@/lib/server/model-config/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/model-config/runtime')>()),
  requestWorkspaceId: async () => undefined,
}));
vi.mock('@/lib/server/model-config/media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/model-config/media')>()),
  resolveMediaSlot: (...args: unknown[]) => mocks.resolveMediaSlot(...args),
}));
vi.mock('@/lib/document', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/document')>()),
  extractDocument: (...args: unknown[]) => mocks.extractDocument(...args),
}));
vi.mock('@/lib/audio/asr-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audio/asr-providers')>()),
  transcribeAudio: (...args: unknown[]) => mocks.transcribeAudio(...args),
}));
vi.mock('@/lib/server/ssrf-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/ssrf-guard')>()),
  validateUrlForSSRF: (...args: unknown[]) => mocks.validateUrlForSSRF(...args),
}));

function chatRequest(): NextRequest {
  const body = {
    messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
    storeState: {},
    config: { agentIds: ['teacher'] },
    model: 'openai:gpt-4o',
    apiKey: 'test-key',
  };
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function uploadRequest(url: string, field: string, name: string, type: string): NextRequest {
  const form = new FormData();
  form.append(field, new File([new Uint8Array([1, 2, 3, 4])], name, { type }));
  return new Request(url, { method: 'POST', body: form }) as unknown as NextRequest;
}

// The routes pull in heavy dependencies; load them before the timed tests run.
beforeAll(async () => {
  await Promise.all([
    import('@/app/api/chat/route'),
    import('@/app/api/parse-pdf/route'),
    import('@/app/api/transcription/route'),
    import('@/app/api/proxy-media/route'),
  ]);
}, 60_000);

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/chat', () => {
  it('sends the fixed message in the SSE error event, not the cause', async () => {
    mocks.resolveModel.mockResolvedValue({
      model: {},
      apiKey: 'test-key',
      providerId: 'openai',
      thinkingConfig: undefined,
    });
    mocks.statelessGenerate.mockImplementation(async function* () {
      throw new Error(`upstream rejected ${SECRET}`);
    });
    const { POST } = await import('@/app/api/chat/route');

    const text = await (await POST(chatRequest())).text();

    expect(text).toContain(`"message":"${CHAT_MESSAGE}"`);
    expect(text).not.toContain(SECRET);
  });

  it('answers a failure before streaming with a fixed INTERNAL_ERROR body', async () => {
    mocks.resolveModel.mockRejectedValue(new Error(`provider config ${SECRET}`));
    const { POST } = await import('@/app/api/chat/route');

    const res = await POST(chatRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'INTERNAL_ERROR',
      error: CHAT_MESSAGE,
    });
  });
});

describe('POST /api/parse-pdf', () => {
  it('answers an internal failure with the fixed PARSE_FAILED message', async () => {
    mocks.resolveMediaSlot.mockResolvedValue({
      providerId: 'unpdf',
      managed: true,
      origin: 'default',
    });
    mocks.extractDocument.mockRejectedValue(new Error(`cannot open /srv/uploads/${SECRET}.pdf`));
    const { POST } = await import('@/app/api/parse-pdf/route');

    const res = await POST(
      uploadRequest('http://localhost/api/parse-pdf', 'pdf', 'doc.pdf', 'application/pdf'),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'PARSE_FAILED',
      error: PDF_MESSAGE,
    });
  });
});

describe('POST /api/transcription', () => {
  it('answers a failure with the fixed message and no details field', async () => {
    mocks.resolveMediaSlot.mockResolvedValue({
      providerId: 'openai-whisper',
      managed: true,
      origin: 'configuration',
    });
    mocks.transcribeAudio.mockRejectedValue(new Error(`Azure STT error (401): key=${SECRET}`));
    const { POST } = await import('@/app/api/transcription/route');

    const res = await POST(
      uploadRequest('http://localhost/api/transcription', 'audio', 'a.webm', 'audio/webm'),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'TRANSCRIPTION_FAILED',
      error: ASR_MESSAGE,
    });
  });
});

describe('POST /api/proxy-media', () => {
  it('answers a failed fetch with the fixed INTERNAL_ERROR message', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`socket reset with ${SECRET}`)));
    const { POST } = await import('@/app/api/proxy-media/route');
    const req = new Request('http://localhost/api/proxy-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://cdn.example.com/a.png?token=abc' }),
    }) as unknown as NextRequest;

    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'INTERNAL_ERROR',
      error: PROXY_MESSAGE,
    });
  });
});
