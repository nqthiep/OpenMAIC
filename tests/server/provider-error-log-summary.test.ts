// Provider failures must be logged as a summary (name/code/frame), never with the
// raw upstream text, which can echo request details. With the operator's key the
// visitor already gets fixed text (B18); this covers the server log side (B52).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { useProviders } from '../fixtures/provider-snapshot';

const UPSTREAM_ECHO = 'SECRET-ECHO-9d2b';

const logError = vi.hoisted(() => vi.fn());

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  generateVideo: vi.fn(),
  normalizeVideoOptions: vi.fn((options: unknown) => options),
  searchWeb: vi.fn(),
  formatSearchResultsAsContext: vi.fn(() => ''),
  transcribeAudio: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: () => undefined,
    warn: () => undefined,
    error: logError,
    debug: () => undefined,
  }),
}));

vi.mock('@/lib/server/authz/viewer', () => ({
  requireSpender: async () => undefined,
}));

vi.mock('@/lib/server/usage-storage', () => ({
  recordGenerationUsage: () => undefined,
}));

vi.mock('@/lib/media/image-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/image-providers')>()),
  generateImage: mocks.generateImage,
}));

vi.mock('@/lib/media/video-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/video-providers')>()),
  generateVideo: mocks.generateVideo,
  normalizeVideoOptions: mocks.normalizeVideoOptions,
}));

vi.mock('@/lib/web-search', () => ({
  searchWeb: mocks.searchWeb,
  formatSearchResultsAsContext: mocks.formatSearchResultsAsContext,
}));

vi.mock('@/lib/audio/asr-providers', () => ({
  transcribeAudio: mocks.transcribeAudio,
}));

vi.mock('@/lib/server/model-config/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/model-config/runtime')>()),
  requestWorkspaceId: async () => null,
}));

vi.mock('@/lib/server/image-sizing', () => ({
  resolveImageSize: (options: unknown) => options,
}));

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: async () => null,
  findUnsafeNetworkTargetError: () => undefined,
  validatePublicUrlForSSRF: async () => null,
}));

function jsonRequest(path: string, body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function formRequest(path: string, fields: Record<string, string | File>): NextRequest {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body: form,
  }) as unknown as NextRequest;
}

/** Every log.error call in the failing request must be a summary, not upstream text. */
function expectSummaryOnly() {
  expect(logError).toHaveBeenCalled();
  for (const call of logError.mock.calls) {
    const line = call.map(String).join(' ');
    expect(line).not.toContain(UPSTREAM_ECHO);
  }
  const lines = logError.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
  expect(lines).toMatch(/code=/);
}

describe('provider failure server logs carry a summary, not upstream text', () => {
  beforeEach(() => {
    vi.resetModules();
    // The server's own providers: the operator's keys serve the request.
    useProviders({
      image: { 'openai-image': { apiKey: 'image-key', models: ['image-model'] } },
      video: { 'minimax-video': { apiKey: 'video-key', models: ['video-model'] } },
      webSearch: { tavily: { apiKey: 'search-key' } },
      asr: { 'openai-whisper': { apiKey: 'asr-key', models: ['asr-model'] } },
    });
    logError.mockClear();
    for (const mock of Object.values(mocks)) mock.mockReset?.();
  });

  it('POST /api/generate/image logs a summary when the provider throws', async () => {
    mocks.generateImage.mockRejectedValue(new Error(`vendor 500: bad key ${UPSTREAM_ECHO}`));
    const { POST } = await import('@/app/api/generate/image/route');

    const response = await POST(jsonRequest('/api/generate/image', { prompt: 'a cat' }));

    expect(response.status).toBe(500);
    expectSummaryOnly();
  });

  it('POST /api/generate/video logs a summary when the provider throws', async () => {
    mocks.generateVideo.mockRejectedValue(new Error(`vendor 500: bad key ${UPSTREAM_ECHO}`));
    const { POST } = await import('@/app/api/generate/video/route');

    const response = await POST(jsonRequest('/api/generate/video', { prompt: 'a cat' }));

    expect(response.status).toBe(500);
    expectSummaryOnly();
  });

  it('POST /api/transcription logs a summary when the ASR provider throws', async () => {
    mocks.transcribeAudio.mockRejectedValue(new Error(`ASR vendor 500: ${UPSTREAM_ECHO}`));
    const { POST } = await import('@/app/api/transcription/route');

    const audio = new File([new Uint8Array([1, 2, 3])], 'clip.webm', { type: 'audio/webm' });
    const response = await POST(formRequest('/api/transcription', { audio }));

    expect(response.status).toBe(500);
    expectSummaryOnly();
  });
});
