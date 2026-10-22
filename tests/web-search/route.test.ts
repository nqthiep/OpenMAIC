import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { clearProviders, useProviders } from '../fixtures/provider-snapshot';

const mocks = vi.hoisted(() => ({
  searchWeb: vi.fn(),
  formatSearchResultsAsContext: vi.fn(() => 'formatted context'),
  resolveModelFromRequest: vi.fn(),
}));

vi.mock('@/lib/web-search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/web-search')>();
  return {
    ...actual,
    searchWeb: mocks.searchWeb,
    formatSearchResultsAsContext: mocks.formatSearchResultsAsContext,
  };
});

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: mocks.resolveModelFromRequest,
}));

vi.mock('@/lib/ai/llm', () => ({
  callLLM: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

async function postWebSearch(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/web-search/route');
  const request = new Request('http://localhost/api/web-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request as unknown as NextRequest);
}

describe('POST /api/web-search', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    clearProviders();
    mocks.searchWeb.mockReset();
    mocks.formatSearchResultsAsContext.mockClear();
    mocks.resolveModelFromRequest.mockReset();
    mocks.resolveModelFromRequest.mockRejectedValue(new Error('model unavailable'));
    mocks.searchWeb.mockResolvedValue({
      answer: '',
      sources: [],
      query: 'test query',
      responseTime: 0.1,
    });
  });

  it('rejects client-controlled base URLs outside the provider allowlist (unmanaged provider)', async () => {
    // No server config ⇒ unmanaged ⇒ the client base URL is actually used, so it
    // must be validated against the allowlist.
    const res = await postWebSearch({
      query: 'test query',
      providerId: 'bocha',
      apiKey: 'bocha-client-key',
      baseUrl: 'http://127.0.0.1:3000/internal',
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      errorCode: 'INVALID_REQUEST',
    });
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });

  it('ignores a client base URL for a managed (server-configured) provider', async () => {
    useProviders({ webSearch: { bocha: { apiKey: 'bocha-server-key' } } });

    // A managed provider is admin-owned: the client base URL (even an invalid
    // one) is dropped rather than rejected, and the server config is used.
    const res = await postWebSearch({
      query: 'test query',
      providerId: 'bocha',
      apiKey: 'bocha-client-key',
      baseUrl: 'http://127.0.0.1:3000/internal',
    });

    expect(res.status).toBe(200);
    expect(mocks.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'bocha',
        apiKey: 'bocha-server-key',
      }),
    );
  });

  it('uses server-configured base URL when no client base URL is supplied', async () => {
    useProviders({
      webSearch: {
        bocha: { apiKey: 'bocha-server-key', baseUrl: 'http://internal-proxy.local/bocha' },
      },
    });

    const res = await postWebSearch({
      query: 'test query',
      providerId: 'bocha',
    });

    expect(res.status).toBe(200);
    expect(mocks.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'bocha',
        apiKey: 'bocha-server-key',
        baseUrl: 'http://internal-proxy.local/bocha',
      }),
    );
  });

  it('routes Exa web search with server-managed credentials', async () => {
    useProviders({
      webSearch: { exa: { apiKey: 'exa-server-key', baseUrl: 'https://api.exa.ai' } },
    });

    const res = await postWebSearch({
      query: 'test query',
      providerId: 'exa',
    });

    expect(res.status).toBe(200);
    expect(mocks.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'exa',
        apiKey: 'exa-server-key',
        baseUrl: 'https://api.exa.ai',
      }),
    );
  });

  it('points to Settings when Exa credentials are missing', async () => {
    const res = await postWebSearch({ query: 'test query', providerId: 'exa' });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('Settings');
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });

  it('runs Brave Search without an API key', async () => {
    const res = await postWebSearch({
      query: 'test query',
      providerId: 'brave',
    });

    expect(res.status).toBe(200);
    expect(mocks.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'brave',
        apiKey: '',
      }),
    );
  });

  it('passes Baidu sub-source toggles through to the dispatcher', async () => {
    useProviders({ webSearch: { baidu: { apiKey: 'baidu-server-key' } } });

    const res = await postWebSearch({
      query: 'test query',
      providerId: 'baidu',
      baiduSubSources: {
        webSearch: false,
        baike: true,
        scholar: false,
      },
    });

    expect(res.status).toBe(200);
    expect(mocks.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'baidu',
        apiKey: 'baidu-server-key',
        baiduSubSources: {
          webSearch: false,
          baike: true,
          scholar: false,
        },
      }),
    );
  });

  it('routes MiniMax web search through the dispatcher with server config', async () => {
    useProviders({
      webSearch: {
        minimax: { apiKey: 'minimax-server-key', baseUrl: 'https://api.minimaxi.com' },
      },
    });

    const res = await postWebSearch({
      query: 'test query',
      providerId: 'minimax',
    });

    expect(res.status).toBe(200);
    expect(mocks.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'minimax',
        apiKey: 'minimax-server-key',
        baseUrl: 'https://api.minimaxi.com',
      }),
    );
  });

  it('routes Claude web search through the dispatcher with the client model', async () => {
    const res = await postWebSearch({
      query: 'test query',
      providerId: 'claude',
      apiKey: 'sk-client-key',
      claudeModelId: 'claude-opus-5',
    });

    expect(res.status).toBe(200);
    expect(mocks.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'claude',
        apiKey: 'sk-client-key',
        claudeModelId: 'claude-opus-5',
      }),
    );
  });

  it('pins the Claude model from the managed provider over the client model', async () => {
    useProviders({
      webSearch: { claude: { apiKey: 'claude-server-key', models: ['claude-sonnet-5'] } },
    });

    const res = await postWebSearch({
      query: 'test query',
      providerId: 'claude',
      claudeModelId: 'claude-haiku-4-5',
    });

    expect(res.status).toBe(200);
    expect(mocks.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'claude',
        apiKey: 'claude-server-key',
        claudeModelId: 'claude-sonnet-5',
      }),
    );
  });

  it('rejects Claude requests without an API key, pointing to Settings', async () => {
    const res = await postWebSearch({
      query: 'test query',
      providerId: 'claude',
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(JSON.stringify(data)).toContain('Settings');
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });

  it('prefers server-configured SearXNG over client-selected Brave', async () => {
    useProviders({ webSearch: { searxng: { baseUrl: 'http://192.168.161.100:6060' } } });

    const res = await postWebSearch({
      query: 'test query',
      providerId: 'brave',
    });

    expect(res.status).toBe(200);
    expect(mocks.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'searxng',
        baseUrl: 'http://192.168.161.100:6060',
      }),
    );
  });

  it('routes SearXNG web search through the dispatcher with server base URL', async () => {
    useProviders({ webSearch: { searxng: { baseUrl: 'http://192.168.161.100:6060' } } });

    const res = await postWebSearch({
      query: 'test query',
      providerId: 'searxng',
    });

    expect(res.status).toBe(200);
    expect(mocks.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'searxng',
        baseUrl: 'http://192.168.161.100:6060',
      }),
    );
  });

  it('rejects SearXNG requests without a configured base URL', async () => {
    const res = await postWebSearch({
      query: 'test query',
      providerId: 'searxng',
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      errorCode: 'MISSING_REQUIRED_FIELD',
    });
    expect(json.error).toContain('shared server credential');
    expect(json.error).not.toContain('Settings');
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });

  it.each([
    'http://127.0.0.1:6060',
    'http://localhost:6060',
    'http://169.254.169.254',
    'http://192.168.161.100:6060',
  ])('ignores client-supplied SearXNG base URLs without server config (%s)', async (baseUrl) => {
    const res = await postWebSearch({
      query: 'test query',
      providerId: 'searxng',
      baseUrl,
    });

    expect(res.status).toBe(400);
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });

  it.each([
    'http://127.0.0.1:6060',
    'http://localhost:6060',
    'http://169.254.169.254',
    'http://10.0.0.5:6060',
  ])(
    'uses operator-configured SearXNG URL and ignores client-supplied base URL (%s)',
    async (clientBaseUrl) => {
      useProviders({ webSearch: { searxng: { baseUrl: 'http://192.168.161.100:6060' } } });

      const res = await postWebSearch({
        query: 'test query',
        providerId: 'searxng',
        baseUrl: clientBaseUrl,
      });

      expect(res.status).toBe(200);
      expect(mocks.searchWeb).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'searxng',
          baseUrl: 'http://192.168.161.100:6060',
        }),
      );
    },
  );

  it('rejects a force-disabled provider with 403 PROVIDER_DISABLED even when it has a key', async () => {
    useProviders({
      webSearch: { tavily: { apiKey: 'tvly-server-key' } },
      disabled: { webSearch: ['tavily'] },
    });

    const res = await postWebSearch({
      query: 'test query',
      providerId: 'tavily',
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      errorCode: 'PROVIDER_DISABLED',
    });
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });

  it('force-off beats a client key: a disabled unmanaged provider still 403s', async () => {
    useProviders({ disabled: { webSearch: ['tavily'] } });

    const res = await postWebSearch({
      query: 'test query',
      providerId: 'tavily',
      apiKey: 'tvly-client-key',
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toMatchObject({ success: false, errorCode: 'PROVIDER_DISABLED' });
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });

  it('falls back to the operator backend when the client picks a disabled provider', async () => {
    // Server has Bocha (enabled); the client asks for Tavily which is
    // force-disabled and NOT server-configured. The server-preference override
    // points at the enabled backend instead of failing the request.
    useProviders({
      webSearch: { bocha: { apiKey: 'bocha-server-key' } },
      disabled: { webSearch: ['tavily'] },
    });

    const res = await postWebSearch({
      query: 'test query',
      providerId: 'tavily',
    });

    expect(res.status).toBe(200);
    expect(mocks.searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'bocha', apiKey: 'bocha-server-key' }),
    );
  });

  it('403s a force-disabled server-configured provider even when the server has an enabled backend', async () => {
    // Tavily is server-configured (key present) but force-disabled, so the
    // server-preference override does NOT apply — the disabled provider itself
    // is rejected rather than silently swapped.
    useProviders({
      webSearch: {
        bocha: { apiKey: 'bocha-server-key' },
        tavily: { apiKey: 'tvly-server-key' },
      },
      disabled: { webSearch: ['tavily'] },
    });

    const res = await postWebSearch({
      query: 'test query',
      providerId: 'tavily',
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toMatchObject({ success: false, errorCode: 'PROVIDER_DISABLED' });
    expect(mocks.searchWeb).not.toHaveBeenCalled();
  });
});
