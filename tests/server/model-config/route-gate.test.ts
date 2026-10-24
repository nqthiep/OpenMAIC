/**
 * KHAITAM: only an administrator (an account allowed `provider.personalKey`) changes the model
 * settings; anyone else gets 403 before any settings are read or written (decision D3).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ allowed: false }));

vi.mock('@/lib/config/feature-flags', () => ({ isServerPersistenceConfigured: () => true }));
vi.mock('@/lib/server/authz/provider-keys', () => ({
  clientKeysAllowed: async () => mocks.allowed,
}));
const withRequestOwner = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/identity/with-owner', () => ({ withRequestOwner }));

const request = (url: string, method: string, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;

describe('model settings writes', () => {
  beforeEach(() => {
    withRequestOwner.mockReset();
    withRequestOwner.mockImplementation(async () => new Response('{}', { status: 200 }));
  });

  it('refuses a change from an account that is not an administrator', async () => {
    mocks.allowed = false;
    const { PUT } = await import('@/app/api/model-config/route');
    const response = await PUT(
      request('/api/model-config', 'PUT', {
        revision: null,
        change: { kind: 'slots', set: { llm: 'openai:gpt-5.6' } },
      }),
    );
    expect(response.status).toBe(403);
    expect(withRequestOwner).not.toHaveBeenCalled();
  });

  it('refuses an import from an account that is not an administrator', async () => {
    mocks.allowed = false;
    const { POST } = await import('@/app/api/model-config/import/route');
    const response = await POST(request('/api/model-config/import', 'POST', { providers: {} }));
    expect(response.status).toBe(403);
    expect(withRequestOwner).not.toHaveBeenCalled();
  });

  it('lets an administrator through to the settings', async () => {
    mocks.allowed = true;
    const { PUT } = await import('@/app/api/model-config/route');
    const response = await PUT(
      request('/api/model-config', 'PUT', {
        revision: null,
        change: { kind: 'slots', set: { llm: 'openai:gpt-5.6' } },
      }),
    );
    expect(response.status).toBe(200);
    expect(withRequestOwner).toHaveBeenCalledOnce();
  });
});
