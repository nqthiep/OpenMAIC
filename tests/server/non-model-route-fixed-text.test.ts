// B49: a non-Error throw under the visitor's own key must not get the "model
// provider" wording on non-model routes. Each route answers with its own fixed
// text instead.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  transcribeAudio: vi.fn(),
  extractDocument: vi.fn(),
  parseWithMinerUCloud: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/lib/server/authz/viewer', () => ({
  requireSpender: async () => undefined,
}));

vi.mock('@/lib/audio/asr-providers', () => ({
  transcribeAudio: mocks.transcribeAudio,
}));

vi.mock('@/lib/document', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/document')>();
  return {
    ...actual,
    extractDocument: mocks.extractDocument,
    documentArtifactToParsedPdfContent: (artifact: unknown) => artifact,
  };
});

vi.mock('@/lib/pdf/mineru-cloud', () => ({
  parseWithMinerUCloud: mocks.parseWithMinerUCloud,
}));

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: async () => null,
  findUnsafeNetworkTargetError: () => undefined,
  validatePublicUrlForSSRF: async () => null,
}));

function formRequest(path: string, fields: Record<string, string | File>): NextRequest {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body: form,
  }) as unknown as NextRequest;
}

describe('non-Error throws on non-model routes use route-specific fixed text', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.transcribeAudio.mockReset();
    mocks.extractDocument.mockReset();
    mocks.parseWithMinerUCloud.mockReset();
  });

  it('POST /api/transcription answers with transcription wording, not "model provider"', async () => {
    // A non-Error throw under the visitor's own key.
    mocks.transcribeAudio.mockRejectedValue('string failure, not an Error');
    const { POST } = await import('@/app/api/transcription/route');

    const audio = new File([new Uint8Array([1, 2, 3])], 'clip.webm', { type: 'audio/webm' });
    const response = await POST(
      formRequest('/api/transcription', {
        audio,
        providerId: 'openai-whisper',
        modelId: 'asr-model',
        apiKey: 'visitor-asr-key',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe('TRANSCRIPTION_FAILED');
    expect(body.details).toBe('The transcription service could not complete this request.');
    expect(body.details).not.toContain('model provider');
  });

  it('POST /api/parse-pdf answers with PDF wording, not "model provider"', async () => {
    mocks.extractDocument.mockRejectedValue('string failure, not an Error');
    const { POST } = await import('@/app/api/parse-pdf/route');

    const pdf = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' });
    const response = await POST(formRequest('/api/parse-pdf', { pdf }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe('PARSE_FAILED');
    expect(body.error).toBe('The PDF parser could not complete this request.');
    expect(body.error).not.toContain('model provider');
  });

  it('POST /api/extract-document answers with extractor wording, not "model provider"', async () => {
    mocks.parseWithMinerUCloud.mockRejectedValue('string failure, not an Error');
    const { POST } = await import('@/app/api/extract-document/route');

    const pdf = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' });
    const response = await POST(
      formRequest('/api/extract-document', {
        file: pdf,
        providerId: 'mineru-cloud',
        apiKey: 'visitor-pdf-key',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe('PARSE_FAILED');
    expect(body.error).toBe('The document extractor could not complete this request.');
    expect(body.error).not.toContain('model provider');
  });
});
