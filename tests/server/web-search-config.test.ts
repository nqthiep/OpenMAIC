import { describe, expect, it, vi, beforeEach } from 'vitest';
import { clearProviders, useProviders } from '../fixtures/provider-snapshot';

describe('server web search config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    clearProviders();
  });

  it('rejects client-controlled base URLs outside the provider allowlist', async () => {
    const { resolveSafeClientWebSearchBaseUrl } = await import('@/lib/server/web-search-config');

    expect(() =>
      resolveSafeClientWebSearchBaseUrl('bocha', 'http://127.0.0.1:3000/internal'),
    ).toThrow('Unsupported Bocha base URL');
  });

  it('allows official Bocha client base URLs', async () => {
    const { resolveSafeClientWebSearchBaseUrl } = await import('@/lib/server/web-search-config');

    expect(resolveSafeClientWebSearchBaseUrl('bocha', 'https://api.bochaai.com/v1')).toBe(
      'https://api.bochaai.com/v1',
    );
  });

  it('allows the web-search base URL every built-in token plan writes to client settings', async () => {
    const { resolveSafeClientWebSearchBaseUrl } = await import('@/lib/server/web-search-config');
    const { TOKEN_PLAN_PRESETS } = await import('@/lib/config/token-plan-presets');
    const targets = TOKEN_PLAN_PRESETS.flatMap((preset) =>
      preset.modalities.webSearch ? [preset.modalities.webSearch] : [],
    );

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(
        resolveSafeClientWebSearchBaseUrl(
          target.providerId as Parameters<typeof resolveSafeClientWebSearchBaseUrl>[0],
          target.baseUrl,
        ),
      ).toBe(target.baseUrl.replace(/\/+$/, ''));
    }
    expect(() =>
      resolveSafeClientWebSearchBaseUrl('bocha', 'https://tokendance.space/gateway/other'),
    ).toThrow('Unsupported Bocha base URL');
  });

  it('allows official Exa client base URLs and resolves client credentials', async () => {
    const { resolveClassroomWebSearchConfig, resolveSafeClientWebSearchBaseUrl } =
      await import('@/lib/server/web-search-config');

    expect(resolveSafeClientWebSearchBaseUrl('exa', 'https://api.exa.ai/search')).toBe(
      'https://api.exa.ai/search',
    );
    expect(
      await resolveClassroomWebSearchConfig(null, {
        webSearchProviderId: 'exa',
        webSearchApiKey: 'exa-client-key',
        webSearchBaseUrl: 'https://api.exa.ai',
      }),
    ).toEqual({
      providerId: 'exa',
      apiKey: 'exa-client-key',
      baseUrl: 'https://api.exa.ai',
    });
  });

  it('resolves Exa classroom config from the managed provider', async () => {
    useProviders({
      webSearch: { exa: { apiKey: 'exa-server-key', baseUrl: 'https://proxy.example.com/exa' } },
    });
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    expect(await resolveClassroomWebSearchConfig(null, { webSearchProviderId: 'exa' })).toEqual({
      providerId: 'exa',
      apiKey: 'exa-server-key',
      baseUrl: 'https://proxy.example.com/exa',
    });
  });

  it('allows official Firecrawl client base URLs and resolves client credentials', async () => {
    const { resolveClassroomWebSearchConfig, resolveSafeClientWebSearchBaseUrl } =
      await import('@/lib/server/web-search-config');

    expect(
      resolveSafeClientWebSearchBaseUrl('firecrawl', 'https://api.firecrawl.dev/v2/search'),
    ).toBe('https://api.firecrawl.dev/v2/search');
    expect(() => resolveSafeClientWebSearchBaseUrl('firecrawl', 'http://127.0.0.1:3002')).toThrow(
      'Unsupported Firecrawl base URL',
    );
    expect(
      await resolveClassroomWebSearchConfig(null, {
        webSearchProviderId: 'firecrawl',
        webSearchApiKey: 'fc-client-key',
        webSearchBaseUrl: 'https://api.firecrawl.dev',
      }),
    ).toEqual({
      providerId: 'firecrawl',
      apiKey: 'fc-client-key',
      baseUrl: 'https://api.firecrawl.dev',
    });
  });

  it('resolves Firecrawl classroom config from the saved provider', async () => {
    useProviders({
      webSearch: { firecrawl: { apiKey: 'fc-server-key', baseUrl: 'https://firecrawl.internal' } },
    });
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    expect(
      await resolveClassroomWebSearchConfig(null, { webSearchProviderId: 'firecrawl' }),
    ).toEqual({
      providerId: 'firecrawl',
      apiKey: 'fc-server-key',
      baseUrl: 'https://firecrawl.internal',
    });
  });

  it('allows official MiniMax client base URLs', async () => {
    const { resolveSafeClientWebSearchBaseUrl } = await import('@/lib/server/web-search-config');

    expect(
      resolveSafeClientWebSearchBaseUrl(
        'minimax',
        'https://api.minimaxi.com/v1/coding_plan/search',
      ),
    ).toBe('https://api.minimaxi.com/v1/coding_plan/search');
  });

  it('resolves classroom web search config from selected provider and client key', async () => {
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    expect(
      await resolveClassroomWebSearchConfig(null, {
        webSearchProviderId: 'bocha',
        webSearchApiKey: 'bocha-client-key',
        webSearchBaseUrl: 'https://api.bochaai.com/v1',
      }),
    ).toEqual({
      providerId: 'bocha',
      apiKey: 'bocha-client-key',
      baseUrl: 'https://api.bochaai.com/v1',
    });
  });

  it("keeps a classroom request's own provider and key on a server that configures none", async () => {
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');
    expect(
      await resolveClassroomWebSearchConfig(null, {
        webSearchProviderId: 'exa',
        webSearchApiKey: 'exa-client-key',
      }),
    ).toMatchObject({ providerId: 'exa', apiKey: 'exa-client-key' });
  });

  it("ignores a request's own provider and key once the server configures providers (decision D3)", async () => {
    useProviders({ webSearch: { tavily: { apiKey: 'server-tavily' } } });
    const { resolveClassroomWebSearchConfig, resolveWebSearchConnection } =
      await import('@/lib/server/web-search-config');
    const requested = { webSearchProviderId: 'exa' as const, webSearchApiKey: 'exa-client-key' };

    expect(await resolveClassroomWebSearchConfig(null, requested)).toMatchObject({
      providerId: 'tavily',
      apiKey: 'server-tavily',
    });
    expect(
      await resolveWebSearchConnection(null, requested, { preferServerProvider: true }),
    ).toMatchObject({ providerId: 'tavily', apiKey: 'server-tavily' });
  });

  it('rejects unsupported client base URLs at the classroom server boundary', async () => {
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    await expect(
      resolveClassroomWebSearchConfig(null, {
        webSearchProviderId: 'bocha',
        webSearchApiKey: 'bocha-client-key',
        webSearchBaseUrl: 'https://evil.example.com/steal-key',
      }),
    ).rejects.toThrow('Unsupported Bocha base URL');
  });

  it('uses server base URL for classroom web search config instead of client-controlled URLs', async () => {
    useProviders({
      webSearch: {
        bocha: { apiKey: 'bocha-server-key', baseUrl: 'http://internal-proxy.local/bocha' },
      },
    });

    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    expect(
      await resolveClassroomWebSearchConfig(null, {
        webSearchProviderId: 'bocha',
        webSearchApiKey: 'stale-client-key',
        webSearchBaseUrl: 'https://api.bochaai.com/v1',
      }),
    ).toEqual({
      providerId: 'bocha',
      apiKey: 'bocha-server-key',
      baseUrl: 'http://internal-proxy.local/bocha',
    });
  });

  it('resolves Brave classroom web search config without an API key', async () => {
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    expect(await resolveClassroomWebSearchConfig(null, { webSearchProviderId: 'brave' })).toEqual({
      providerId: 'brave',
      apiKey: '',
      baseUrl: undefined,
    });
  });

  it('resolves MiniMax classroom web search config from the managed provider', async () => {
    useProviders({
      webSearch: {
        minimax: { apiKey: 'minimax-server-key', baseUrl: 'https://api.minimaxi.com' },
      },
    });

    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    expect(await resolveClassroomWebSearchConfig(null, { webSearchProviderId: 'minimax' })).toEqual(
      {
        providerId: 'minimax',
        apiKey: 'minimax-server-key',
        baseUrl: 'https://api.minimaxi.com',
      },
    );
  });

  it('allows official Claude client base URLs and rejects others', async () => {
    const { resolveSafeClientWebSearchBaseUrl } = await import('@/lib/server/web-search-config');

    expect(resolveSafeClientWebSearchBaseUrl('claude', 'https://api.anthropic.com/v1')).toBe(
      'https://api.anthropic.com/v1',
    );
    expect(resolveSafeClientWebSearchBaseUrl('claude', 'https://api.anthropic.com/')).toBe(
      'https://api.anthropic.com',
    );
    expect(() =>
      resolveSafeClientWebSearchBaseUrl('claude', 'https://evil.example.com/v1'),
    ).toThrow('Unsupported Claude base URL');
  });

  it('resolves Claude classroom web search config with the client-selected model', async () => {
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    expect(
      await resolveClassroomWebSearchConfig(null, {
        webSearchProviderId: 'claude',
        webSearchApiKey: 'sk-client-key',
        webSearchModelId: 'claude-opus-5',
      }),
    ).toEqual({
      providerId: 'claude',
      apiKey: 'sk-client-key',
      baseUrl: undefined,
      claudeModelId: 'claude-opus-5',
    });
  });

  it("ignores the request's Claude model: the server's saved configuration decides (D3)", async () => {
    useProviders({ webSearch: { claude: { apiKey: 'sk-server-key' } } });
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    const config = await resolveClassroomWebSearchConfig(null, {
      webSearchModelId: 'claude-opus-5',
    });
    expect(config).toMatchObject({ providerId: 'claude' });
    expect(config).not.toMatchObject({ claudeModelId: 'claude-opus-5' });
  });

  it('pins the Claude model of the provider the server configures over the client model', async () => {
    useProviders({
      webSearch: {
        claude: {
          apiKey: 'sk-server-key',
          baseUrl: 'https://api.anthropic.com/v1',
          models: ['claude-sonnet-5', 'claude-opus-5'],
        },
      },
    });

    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    // KHAITAM patch point: upstream refuses an unlisted model a request names. The saved
    // configuration decides here (D3), so what the request names is ignored, listed or not.
    for (const webSearchModelId of ['claude-haiku-4-5', 'claude-opus-5']) {
      expect(
        await resolveClassroomWebSearchConfig(null, {
          webSearchProviderId: 'claude',
          webSearchModelId,
        }),
      ).toEqual({
        providerId: 'claude',
        apiKey: 'sk-server-key',
        baseUrl: 'https://api.anthropic.com/v1',
        claudeModelId: 'claude-sonnet-5',
      });
    }
  });

  it.each([
    'http://127.0.0.1:6060',
    'http://localhost:6060',
    'http://169.254.169.254',
    'http://192.168.161.100:6060/search',
  ])('rejects client-supplied SearXNG base URLs (%s)', async (baseUrl) => {
    const { resolveSafeClientWebSearchBaseUrl } = await import('@/lib/server/web-search-config');

    expect(() => resolveSafeClientWebSearchBaseUrl('searxng', baseUrl)).toThrow(
      'Unsupported SearXNG base URL',
    );
  });

  it('resolves SearXNG classroom web search config from server base URL', async () => {
    useProviders({ webSearch: { searxng: { baseUrl: 'http://192.168.161.100:6060' } } });

    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    expect(await resolveClassroomWebSearchConfig(null, { webSearchProviderId: 'searxng' })).toEqual(
      {
        providerId: 'searxng',
        apiKey: '',
        baseUrl: 'http://192.168.161.100:6060',
      },
    );
  });

  it('returns undefined for SearXNG classroom config without a base URL', async () => {
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    expect(
      await resolveClassroomWebSearchConfig(null, { webSearchProviderId: 'searxng' }),
    ).toBeUndefined();
  });

  it('keeps Baidu sub-source toggles in classroom web search config', async () => {
    useProviders({ webSearch: { baidu: { apiKey: 'baidu-server-key' } } });

    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');

    expect(
      await resolveClassroomWebSearchConfig(null, {
        webSearchProviderId: 'baidu',
        baiduSubSources: { webSearch: false, baike: true, scholar: false },
      }),
    ).toEqual({
      providerId: 'baidu',
      apiKey: 'baidu-server-key',
      baseUrl: undefined,
      baiduSubSources: { webSearch: false, baike: true, scholar: false },
    });
  });
});

describe('Kimi official search bases', () => {
  it.each([
    'https://api.moonshot.cn/v1',
    'https://api.moonshot.ai/v1',
    'https://api.kimi.com/coding/v1',
    'https://api.kimi.ai/coding/v1',
  ])('accepts %s', async (baseUrl) => {
    const { resolveSafeClientWebSearchBaseUrl } = await import('@/lib/server/web-search-config');
    expect(resolveSafeClientWebSearchBaseUrl('kimi', baseUrl)).toBe(baseUrl);
  });
  it('rejects lookalike endpoints', async () => {
    const { resolveSafeClientWebSearchBaseUrl } = await import('@/lib/server/web-search-config');
    expect(() =>
      resolveSafeClientWebSearchBaseUrl('kimi', 'https://api.kimi.com.openmaic.test/coding/v1'),
    ).toThrow('Unsupported Kimi base URL');
  });
});
