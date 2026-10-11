import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// A failed connectivity test can quote the provider's response. With the operator's key, that
// text must not reach the visitor. With the visitor's own key, the text describes their own key.
const mocks = vi.hoisted(() => ({
  isServerConfiguredProvider: vi.fn(),
  testImageConnectivity: vi.fn(),
}));

vi.mock('@/lib/media/image-providers', () => ({
  IMAGE_PROVIDERS: { seedream: { requiresApiKey: false, models: [] } },
  testImageConnectivity: mocks.testImageConnectivity,
}));

vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: mocks.isServerConfiguredProvider,
  isServerProviderDisabled: () => false,
  resolveImageApiKey: (_providerId: string, clientKey?: string) => clientKey ?? 'server-key',
  resolveImageBaseUrl: () => undefined,
  resolveImageModel: () => 'model-x',
  resolveServerImageProviderId: () => 'seedream',
}));

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: async () => null,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const UPSTREAM_TEXT = 'Invalid API key sk-live-echoed-in-the-upstream-message';

async function verify(headers: Record<string, string> = {}) {
  const { POST } = await import('@/app/api/verify-image-provider/route');
  const request = new Request('http://localhost/api/verify-image-provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: '{}',
  });
  return POST(request as unknown as NextRequest);
}

describe('POST /api/verify-image-provider upstream error text', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.isServerConfiguredProvider.mockReset();
    mocks.testImageConnectivity.mockReset();
    mocks.testImageConnectivity.mockResolvedValue({ success: false, message: UPSTREAM_TEXT });
  });

  it('sends a fixed message, and no upstream text, when the operator key is used', async () => {
    mocks.isServerConfiguredProvider.mockReturnValue(true);

    const response = await verify();
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toContain('The model provider could not complete this request.');
    expect(text).not.toContain('sk-live-echoed');
    expect(text).not.toContain('Invalid API key');
  });

  it('keeps the upstream text for a visitor who supplied their own key', async () => {
    mocks.isServerConfiguredProvider.mockReturnValue(false);

    const response = await verify({ 'x-api-key': 'visitor-key' });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toContain('Invalid API key');
  });
});
