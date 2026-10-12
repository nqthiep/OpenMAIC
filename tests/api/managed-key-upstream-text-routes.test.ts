import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { MODEL_FAILURE_TEXT } from '@/lib/server/error-summary';

// Upstream provider text can echo a key or a vendor body. With the operator's key, that text
// must not reach the visitor. With the visitor's own key, the upstream message is returned.
const UPSTREAM_FRAGMENT = 'UPSTREAM-ECHO-7f3a';
const OPERATOR_KEY = 'server-managed-key';
const VISITOR_KEY = 'visitor-own-key';

const mocks = vi.hoisted(() => {
  class TTSRateLimitError extends Error {
    constructor(_provider: string, message: string) {
      super(message);
    }
  }
  class QwenTTSError extends Error {}
  class TTSInvalidResponseError extends Error {}
  class QwenVoiceCloneError extends Error {}
  class TTSModelNotAllowedError extends Error {}
  return {
    TTSRateLimitError,
    QwenTTSError,
    TTSInvalidResponseError,
    QwenVoiceCloneError,
    TTSModelNotAllowedError,
    transcribeAudio: vi.fn(),
    extractDocument: vi.fn(),
    documentArtifactToParsedPdfContent: vi.fn(),
    searchWeb: vi.fn(),
    formatSearchResultsAsContext: vi.fn(),
    generateTTS: vi.fn(),
    isServerConfiguredProvider: vi.fn(),
    resolveASRApiKey: vi.fn(),
    resolvePDFApiKey: vi.fn(),
    resolvePDFBaseUrl: vi.fn(),
    resolveTTSApiKey: vi.fn(),
    resolveWebSearchApiKey: vi.fn(),
  };
});

vi.mock('@/lib/audio/asr-providers', () => ({
  transcribeAudio: mocks.transcribeAudio,
}));

vi.mock('@/lib/audio/tts-providers', () => ({
  generateTTS: mocks.generateTTS,
  QwenTTSError: mocks.QwenTTSError,
  TTSInvalidResponseError: mocks.TTSInvalidResponseError,
  TTSRateLimitError: mocks.TTSRateLimitError,
}));

vi.mock('@/lib/audio/qwen-voice-clone', () => ({
  QwenVoiceCloneError: mocks.QwenVoiceCloneError,
  qwenVoiceCloneErrorMessage: () => 'unused',
}));

vi.mock('@/lib/server/usage-storage', () => ({
  recordGenerationUsage: () => undefined,
}));

vi.mock('@/lib/document', () => ({
  documentArtifactToParsedPdfContent: mocks.documentArtifactToParsedPdfContent,
  extractDocument: mocks.extractDocument,
}));

vi.mock('@/lib/web-search', () => ({
  formatSearchResultsAsContext: mocks.formatSearchResultsAsContext,
  searchWeb: mocks.searchWeb,
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: async () => {
    throw new Error('query rewrite unavailable');
  },
}));

vi.mock('@/lib/ai/llm', () => ({
  callLLM: () => undefined,
}));

vi.mock('@/lib/server/web-search-config', () => ({
  resolveWebSearchRouteBaseUrl: () => undefined,
}));

vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: mocks.isServerConfiguredProvider,
  isServerProviderDisabled: () => false,
  isServerTTSProviderDisabled: () => false,
  resolveASRApiKey: mocks.resolveASRApiKey,
  resolveASRBaseUrl: () => undefined,
  resolveASRModel: (_providerId: string, modelId?: string) => modelId,
  resolveManagedAliDocMindCredentials: () => undefined,
  resolvePDFApiKey: mocks.resolvePDFApiKey,
  resolvePDFBaseUrl: mocks.resolvePDFBaseUrl,
  resolveServerASRProviderId: () => undefined,
  resolveServerWebSearchProviderId: () => undefined,
  resolveTTSApiKey: mocks.resolveTTSApiKey,
  resolveTTSBaseUrl: () => undefined,
  resolveTTSModel: () => undefined,
  resolveWebSearchApiKey: mocks.resolveWebSearchApiKey,
  resolveWebSearchModel: () => undefined,
  TTSModelNotAllowedError: mocks.TTSModelNotAllowedError,
}));

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: async () => null,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  }),
}));

function formRequest(path: string, fields: Record<string, string | File>): NextRequest {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body: form,
  }) as unknown as NextRequest;
}

function jsonRequest(path: string, body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('upstream provider text on the operator key', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.isServerConfiguredProvider.mockReset();
    mocks.transcribeAudio.mockReset();
    mocks.extractDocument.mockReset();
    mocks.searchWeb.mockReset();
    mocks.generateTTS.mockReset();
    mocks.resolveASRApiKey.mockReset();
    mocks.resolvePDFApiKey.mockReset();
    mocks.resolvePDFBaseUrl.mockReset();
    mocks.resolveTTSApiKey.mockReset();
    mocks.resolveWebSearchApiKey.mockReset();

    mocks.isServerConfiguredProvider.mockReturnValue(false);
    mocks.resolveASRApiKey.mockImplementation(
      (_providerId: string, clientKey?: string) => clientKey ?? OPERATOR_KEY,
    );
    mocks.resolvePDFApiKey.mockImplementation(
      (_providerId: string, clientKey?: string) => clientKey ?? OPERATOR_KEY,
    );
    mocks.resolvePDFBaseUrl.mockImplementation(
      (_providerId: string, clientBaseUrl?: string) => clientBaseUrl,
    );
    mocks.resolveTTSApiKey.mockImplementation(
      (_providerId: string, clientKey?: string) => clientKey ?? OPERATOR_KEY,
    );
    mocks.resolveWebSearchApiKey.mockImplementation(
      (_providerId: string, clientKey?: string) => clientKey ?? OPERATOR_KEY,
    );
    mocks.formatSearchResultsAsContext.mockReturnValue('');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('POST /api/transcription', () => {
    const audio = () => new File([new Uint8Array([1, 2, 3])], 'clip.webm', { type: 'audio/webm' });

    it('sends fixed text, and no upstream text, when the operator key is used', async () => {
      mocks.isServerConfiguredProvider.mockReturnValue(true);
      mocks.transcribeAudio.mockRejectedValue(
        new Error(`AssemblyAI ASR API error: rejected key ${UPSTREAM_FRAGMENT}`),
      );
      const { POST } = await import('@/app/api/transcription/route');

      const response = await POST(
        formRequest('/api/transcription', { audio: audio(), providerId: 'assemblyai' }),
      );
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text)).toMatchObject({
        errorCode: 'TRANSCRIPTION_FAILED',
        details: MODEL_FAILURE_TEXT,
      });
      expect(text).not.toContain(UPSTREAM_FRAGMENT);
      expect(mocks.transcribeAudio.mock.calls[0][0]).toMatchObject({ apiKey: OPERATOR_KEY });
    });

    it('keeps the upstream text for a visitor who supplied their own key', async () => {
      mocks.isServerConfiguredProvider.mockReturnValue(false);
      mocks.transcribeAudio.mockRejectedValue(
        new Error(`AssemblyAI ASR API error: rejected key ${UPSTREAM_FRAGMENT}`),
      );
      const { POST } = await import('@/app/api/transcription/route');

      const response = await POST(
        formRequest('/api/transcription', {
          audio: audio(),
          providerId: 'assemblyai',
          apiKey: VISITOR_KEY,
        }),
      );
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text).details).toContain(UPSTREAM_FRAGMENT);
      expect(mocks.transcribeAudio.mock.calls[0][0]).toMatchObject({ apiKey: VISITOR_KEY });
    });
  });

  describe('POST /api/parse-pdf', () => {
    const pdf = () =>
      new File([new Uint8Array([37, 80, 68, 70])], 'lesson.pdf', { type: 'application/pdf' });

    it('sends fixed text, and no upstream text, when the operator key is used', async () => {
      mocks.isServerConfiguredProvider.mockReturnValue(true);
      mocks.extractDocument.mockRejectedValue(
        new Error(`MinerU rejected key ${UPSTREAM_FRAGMENT}`),
      );
      const { POST } = await import('@/app/api/parse-pdf/route');

      const response = await POST(
        formRequest('/api/parse-pdf', { pdf: pdf(), providerId: 'mineru-cloud' }),
      );
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text)).toMatchObject({
        errorCode: 'PARSE_FAILED',
        error: MODEL_FAILURE_TEXT,
      });
      expect(text).not.toContain(UPSTREAM_FRAGMENT);
      expect(mocks.extractDocument.mock.calls[0][0].config).toMatchObject({
        apiKey: OPERATOR_KEY,
      });
    });

    it('keeps the upstream text for a visitor who supplied their own key', async () => {
      mocks.isServerConfiguredProvider.mockReturnValue(false);
      mocks.extractDocument.mockRejectedValue(
        new Error(`MinerU rejected key ${UPSTREAM_FRAGMENT}`),
      );
      const { POST } = await import('@/app/api/parse-pdf/route');

      const response = await POST(
        formRequest('/api/parse-pdf', {
          pdf: pdf(),
          providerId: 'mineru-cloud',
          apiKey: VISITOR_KEY,
        }),
      );
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text).error).toContain(UPSTREAM_FRAGMENT);
      expect(mocks.extractDocument.mock.calls[0][0].config).toMatchObject({
        apiKey: VISITOR_KEY,
      });
    });
  });

  describe('POST /api/web-search', () => {
    it('sends fixed text, and no upstream text, when the operator key is used', async () => {
      mocks.isServerConfiguredProvider.mockReturnValue(true);
      mocks.searchWeb.mockRejectedValue(new Error(`Tavily API error (401): ${UPSTREAM_FRAGMENT}`));
      const { POST } = await import('@/app/api/web-search/route');

      const response = await POST(
        jsonRequest('/api/web-search', {
          query: 'photosynthesis lesson',
          providerId: 'tavily',
          apiKey: VISITOR_KEY,
        }),
      );
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text)).toMatchObject({
        errorCode: 'INTERNAL_ERROR',
        error: MODEL_FAILURE_TEXT,
      });
      expect(text).not.toContain(UPSTREAM_FRAGMENT);
      expect(mocks.searchWeb.mock.calls[0][0]).toMatchObject({ apiKey: OPERATOR_KEY });
    });

    it('keeps the upstream text for a visitor who supplied their own key', async () => {
      mocks.isServerConfiguredProvider.mockReturnValue(false);
      mocks.searchWeb.mockRejectedValue(new Error(`Tavily API error (401): ${UPSTREAM_FRAGMENT}`));
      const { POST } = await import('@/app/api/web-search/route');

      const response = await POST(
        jsonRequest('/api/web-search', {
          query: 'photosynthesis lesson',
          providerId: 'tavily',
          apiKey: VISITOR_KEY,
        }),
      );
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text).error).toContain(UPSTREAM_FRAGMENT);
      expect(mocks.searchWeb.mock.calls[0][0]).toMatchObject({ apiKey: VISITOR_KEY });
    });
  });

  describe('POST /api/verify-pdf-provider', () => {
    it('sends fixed text, and no upstream text, when the operator key is used', async () => {
      mocks.isServerConfiguredProvider.mockReturnValue(true);
      const fetchMock = vi.fn(
        async () =>
          new Response(`invalid token ${UPSTREAM_FRAGMENT}`, {
            status: 401,
            statusText: 'Unauthorized',
          }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const { POST } = await import('@/app/api/verify-pdf-provider/route');

      const response = await POST(
        jsonRequest('/api/verify-pdf-provider', { providerId: 'mineru-cloud' }),
      );
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text)).toMatchObject({
        errorCode: 'INTERNAL_ERROR',
        error: MODEL_FAILURE_TEXT,
      });
      expect(text).not.toContain(UPSTREAM_FRAGMENT);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/extract-results/batch/test-connection'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${OPERATOR_KEY}` }),
        }),
      );
    });

    it('keeps the upstream text for a visitor who supplied their own key', async () => {
      mocks.isServerConfiguredProvider.mockReturnValue(false);
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(`invalid token ${UPSTREAM_FRAGMENT}`, {
              status: 401,
              statusText: 'Unauthorized',
            }),
        ),
      );
      const { POST } = await import('@/app/api/verify-pdf-provider/route');

      const response = await POST(
        jsonRequest('/api/verify-pdf-provider', {
          providerId: 'mineru-cloud',
          apiKey: VISITOR_KEY,
        }),
      );
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text).error).toContain(UPSTREAM_FRAGMENT);
    });
  });

  describe('POST /api/generate/tts', () => {
    const ttsBody = {
      text: 'Welcome to the lesson.',
      audioId: 'audio-1',
      ttsProviderId: 'doubao-tts',
      ttsVoice: 'voice-a',
    };

    it('sends fixed text on a rate-limit error when the operator key is used', async () => {
      mocks.isServerConfiguredProvider.mockReturnValue(true);
      mocks.generateTTS.mockRejectedValue(
        new mocks.TTSRateLimitError(
          'doubao-tts',
          `concurrency quota exceeded ${UPSTREAM_FRAGMENT}`,
        ),
      );
      const { POST } = await import('@/app/api/generate/tts/route');

      const response = await POST(jsonRequest('/api/generate/tts', ttsBody));
      const text = await response.text();

      expect(response.status).toBe(429);
      expect(JSON.parse(text)).toMatchObject({
        errorCode: 'RATE_LIMITED',
        error: MODEL_FAILURE_TEXT,
      });
      expect(text).not.toContain(UPSTREAM_FRAGMENT);
    });

    it('keeps the upstream text on a rate-limit error for a visitor who supplied their own key', async () => {
      mocks.isServerConfiguredProvider.mockReturnValue(false);
      mocks.generateTTS.mockRejectedValue(
        new mocks.TTSRateLimitError(
          'doubao-tts',
          `concurrency quota exceeded ${UPSTREAM_FRAGMENT}`,
        ),
      );
      const { POST } = await import('@/app/api/generate/tts/route');

      const response = await POST(
        jsonRequest('/api/generate/tts', { ...ttsBody, ttsApiKey: VISITOR_KEY }),
      );
      const text = await response.text();

      expect(response.status).toBe(429);
      expect(JSON.parse(text).error).toContain(UPSTREAM_FRAGMENT);
    });

    it('sends fixed text on a generic failure when the operator key is used', async () => {
      mocks.isServerConfiguredProvider.mockReturnValue(true);
      mocks.generateTTS.mockRejectedValue(
        new Error(`Doubao TTS error: ${UPSTREAM_FRAGMENT} (code: 45000001)`),
      );
      const { POST } = await import('@/app/api/generate/tts/route');

      const response = await POST(jsonRequest('/api/generate/tts', ttsBody));
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text)).toMatchObject({
        errorCode: 'GENERATION_FAILED',
        error: MODEL_FAILURE_TEXT,
      });
      expect(text).not.toContain(UPSTREAM_FRAGMENT);
    });
  });
});
