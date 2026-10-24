import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APICallError } from 'ai';
import type { NextRequest } from 'next/server';

// Upstream error text can echo request details. With the operator's key, that text must not reach
// the visitor. With the visitor's own key, it stays, because it describes their own key.
const mocks = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  callLLM: vi.fn(),
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModel: mocks.resolveModel,
}));

vi.mock('@/lib/ai/llm', () => ({
  callLLM: mocks.callLLM,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const UPSTREAM_TEXT = 'Incorrect API key provided: sk-live-echoed-in-the-upstream-message';

async function verify(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/verify-model/route');
  const request = new Request('http://localhost/api/verify-model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request as unknown as NextRequest);
}

describe('POST /api/verify-model upstream error text', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.resolveModel.mockReset();
    mocks.callLLM.mockReset();
    mocks.callLLM.mockRejectedValue(new Error(UPSTREAM_TEXT));
  });

  it('sends a fixed message, and no upstream text, when the operator key was used', async () => {
    mocks.resolveModel.mockResolvedValue({ model: {}, managedKey: true });

    const response = await verify({ model: 'openai:gpt-x', apiKey: '' });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toContain('Cannot connect to API server');
    expect(text).not.toContain('sk-live-echoed');
    expect(text).not.toContain('Incorrect API key');
  });

  // Upstream's rule, which KHAITAM follows: provider text is never returned, whoever's key it was.
  it('sends the same fixed message to a visitor who supplied their own key', async () => {
    mocks.resolveModel.mockResolvedValue({ model: {}, managedKey: false });

    const response = await verify({ model: 'openai:gpt-x', apiKey: 'sk-visitor-own' });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toContain('Cannot connect to API server');
    expect(text).not.toContain('Incorrect API key provided');
  });

  it('still maps a recognised upstream status to its fixed message with the operator key', async () => {
    mocks.resolveModel.mockResolvedValue({ model: {}, managedKey: true });
    mocks.callLLM.mockRejectedValue(
      new APICallError({
        message: 'Unauthorized',
        url: 'https://x',
        requestBodyValues: {},
        statusCode: 401,
      }),
    );

    const response = await verify({ model: 'openai:gpt-x', apiKey: '' });
    const body = (await response.json()) as { error: string };

    expect(body.error).toBe('API key is invalid or expired');
  });
});
