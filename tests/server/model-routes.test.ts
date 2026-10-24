import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('model-routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('exposes the routable stage registry', async () => {
    const { LLM_STAGES } = await import('@/lib/server/model-routes');
    expect(LLM_STAGES).toEqual(
      expect.arrayContaining([
        'scene-content:slide',
        'scene-content:quiz',
        'scene-content:interactive',
        'scene-content:pbl',
        'scene-outlines-stream',
        'scene-content',
        'scene-actions',
        'agent-profiles',
        'quiz-grade',
        'chat-adapter',
        'web-search-query-rewrite',
        'maic-agent-driver',
        'conversation-title',
      ]),
    );
  });

  it('no longer lists stage keys nothing resolves', async () => {
    const { LLM_STAGES } = await import('@/lib/server/model-routes');
    expect(LLM_STAGES).not.toContain('pbl-chat');
    expect(LLM_STAGES).not.toContain('maic-agent');
    expect(LLM_STAGES).not.toContain('generate-classroom');
  });

  it('parses a user route object with the full thinking config', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { parseUserStageRoutes } = await import('@/lib/server/model-routes');
    const routes = parseUserStageRoutes(
      JSON.stringify({
        'scene-content:quiz': {
          model: 'anthropic:claude-sonnet-4',
          thinking: { mode: 'enabled', budgetTokens: 2048, level: 'nope' },
        },
      }),
    );
    expect(routes['scene-content:quiz']).toEqual({
      model: 'anthropic:claude-sonnet-4',
      thinking: { mode: 'enabled', budgetTokens: 2048 },
    });
    warn.mockRestore();
  });

  it('never parses a fallback from the user x-model-routes header (the slot fallback applies)', async () => {
    const { parseUserStageRoutes } = await import('@/lib/server/model-routes');
    const routes = parseUserStageRoutes(
      JSON.stringify({
        'chat-adapter': { model: 'minimax:MiniMax-M3', fallback: 'qwen:user-fb' },
      }),
    );
    expect(routes['chat-adapter']).toEqual({ model: 'minimax:MiniMax-M3' });
    expect(routes['chat-adapter']?.fallback).toBeUndefined();
  });

  it('parses known user stages from x-model-routes and drops unknown ones', async () => {
    const { parseUserStageRoutes } = await import('@/lib/server/model-routes');
    const routes = parseUserStageRoutes(
      JSON.stringify({
        'chat-adapter': 'minimax:MiniMax-M3',
        'quiz-grade': {
          model: 'anthropic:claude-sonnet-4',
          apiKey: 'user-key',
          baseUrl: 'https://user.example/v1',
          providerType: 'anthropic',
        },
        'not-a-stage': 'openai:gpt-5.4',
      }),
    );
    expect(routes['chat-adapter']).toEqual({ model: 'minimax:MiniMax-M3' });
    expect(routes['quiz-grade']).toEqual({
      model: 'anthropic:claude-sonnet-4',
      apiKey: 'user-key',
      baseUrl: 'https://user.example/v1',
      providerType: 'anthropic',
    });
    expect(routes).not.toHaveProperty('not-a-stage');
  });

  it('returns no user routes for malformed, empty, or oversized headers', async () => {
    const { parseUserStageRoutes } = await import('@/lib/server/model-routes');
    expect(parseUserStageRoutes(undefined)).toEqual({});
    expect(parseUserStageRoutes(null)).toEqual({});
    expect(parseUserStageRoutes('not json')).toEqual({});
    expect(parseUserStageRoutes('[]')).toEqual({});
    expect(parseUserStageRoutes('x'.repeat(17 * 1024))).toEqual({});
  });

  it('resolves a composite user route from its parent key', async () => {
    const { getUserStageRoute } = await import('@/lib/server/model-routes');
    const routes = { 'pbl-v2-runtime': { model: 'anthropic:claude-sonnet-4' } };
    expect(getUserStageRoute(routes, 'pbl-v2-runtime:instructor')).toEqual({
      model: 'anthropic:claude-sonnet-4',
    });
    expect(getUserStageRoute(routes, 'chat-adapter')).toBeUndefined();
  });
});

// The stored routes of the provider store are read one value at a time (see
// provider-store-layer.ts); these cover how a value is read.
describe('parseRouteValue', () => {
  const warn = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    warn.mockReset();
    vi.doMock('@/lib/logger', () => ({
      createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
  });

  const parse = async (value: unknown, key = 'maic-agent-driver') =>
    (await import('@/lib/server/model-routes')).parseRouteValue(key, value);

  it('treats a string as a model with no thinking', async () => {
    expect(await parse('openai:gpt-5.4', 'scene-content')).toEqual({ model: 'openai:gpt-5.4' });
    expect(await parse('   ')).toBeUndefined();
  });

  it('parses an object route with the full thinking config', async () => {
    expect(
      await parse({ model: 'openai:gpt-5.4', thinking: { effort: 'high' } }, 'scene-content'),
    ).toEqual({ model: 'openai:gpt-5.4', thinking: { effort: 'high' } });
    expect(
      await parse(
        {
          model: 'anthropic:claude-sonnet-4',
          thinking: { mode: 'enabled', enabled: true, budgetTokens: 2048, level: 'high' },
        },
        'scene-content',
      ),
    ).toEqual({
      model: 'anthropic:claude-sonnet-4',
      thinking: { mode: 'enabled', enabled: true, budgetTokens: 2048, level: 'high' },
    });
  });

  it('drops invalid thinking fields with a warning but keeps the model', async () => {
    const route = await parse(
      { model: 'openai:gpt-5.4', thinking: { mode: 'sideways', budgetTokens: 'lots' } },
      'scene-content',
    );
    expect(route).toEqual({ model: 'openai:gpt-5.4' });
    expect(warn).toHaveBeenCalled();
  });

  it('ignores an object route value with no model string', async () => {
    expect(await parse({ thinking: { effort: 'high' } }, 'scene-content')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('parses an api and a contextWindow, and floors a fractional window', async () => {
    expect(
      await parse({ model: 'openai:m', api: 'openai-completions', contextWindow: 32_000 }),
    ).toEqual({ model: 'openai:m', api: 'openai-completions', contextWindow: 32_000 });
    expect(await parse({ model: 'openai:m', contextWindow: 32_000.9 })).toEqual({
      model: 'openai:m',
      contextWindow: 32_000,
    });
  });

  it('accepts dialect as an alias for api, and api wins over it with a warning', async () => {
    expect(await parse({ model: 'openai:m', dialect: 'openai-responses' })).toEqual({
      model: 'openai:m',
      api: 'openai-responses',
    });
    expect(
      await parse({ model: 'openai:m', api: 'openai-completions', dialect: 'anthropic-messages' }),
    ).toEqual({ model: 'openai:m', api: 'openai-completions' });
    expect(warn).toHaveBeenCalledWith(
      'Both api and dialect are set for stage "maic-agent-driver"; api wins.',
    );
  });

  it('uses dialect when api is invalid and warns', async () => {
    expect(await parse({ model: 'openai:m', api: 123, dialect: 'openai-completions' })).toEqual({
      model: 'openai:m',
      api: 'openai-completions',
    });
    expect(warn).toHaveBeenCalled();
  });

  it('drops a non-string api or dialect, and a bad contextWindow, keeping the model', async () => {
    for (const bad of [
      { api: 123 },
      { dialect: ['openai-completions'] },
      { contextWindow: 0.5 },
      { contextWindow: 0 },
      { contextWindow: '32000' },
    ]) {
      warn.mockReset();
      expect(await parse({ model: 'openai:m', ...bad })).toEqual({ model: 'openai:m' });
      expect(warn).toHaveBeenCalled();
    }
  });

  it('keeps vision and tools and ignores values that are not booleans', async () => {
    expect(
      await parse({ model: 'omniroute:auto/best-vision', vision: true, tools: false }),
    ).toEqual({ model: 'omniroute:auto/best-vision', vision: true, tools: false });
    expect(await parse({ model: 'omniroute:auto/best-chat', vision: 'yes', tools: 1 })).toEqual({
      model: 'omniroute:auto/best-chat',
    });
  });

  it('parses a per-stage fallback and ignores a blank one with a warning', async () => {
    expect(await parse({ model: 'openai:a', fallback: 'qwen:b' })).toEqual({
      model: 'openai:a',
      fallback: 'qwen:b',
    });
    expect(await parse({ model: 'openai:a', fallback: '  ' })).toEqual({ model: 'openai:a' });
    expect(warn).toHaveBeenCalled();
  });
});
