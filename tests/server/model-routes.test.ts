import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProviders, useProviders } from '../fixtures/provider-snapshot';

// model-routes reads the routes from the provider snapshot and caches the parsed map per
// snapshot object. Each case installs its own routes with useProviders and resets the module
// registry so the parse (and its warnings) happens again.

describe('model-routes', () => {
  beforeEach(() => {
    vi.resetModules();
    clearProviders();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearProviders();
  });

  it('returns undefined for any stage when no routes are configured', async () => {
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel('scene-content')).toBeUndefined();
    expect(getStageModel('pbl-chat')).toBeUndefined();
  });

  it('returns the default model from the snapshot, or undefined when none is set', async () => {
    const { getDefaultModel } = await import('@/lib/server/model-routes');
    expect(getDefaultModel()).toBeUndefined();
    useProviders({ defaultModel: 'openai:gpt-5.4-mini' });
    expect(getDefaultModel()).toBe('openai:gpt-5.4-mini');
  });

  it('returns undefined when no stage is provided', async () => {
    useProviders({ routes: { 'scene-content': 'openai:gpt-5.4' } });
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel(undefined)).toBeUndefined();
  });

  it('returns the mapped model for a configured routable stage', async () => {
    useProviders({
      routes: {
        'scene-content': 'openai:gpt-5.4',
        'pbl-chat': 'anthropic:claude-sonnet-4',
      },
    });
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel('scene-content')).toBe('openai:gpt-5.4');
    expect(getStageModel('pbl-chat')).toBe('anthropic:claude-sonnet-4');
  });

  it('routes the MAIC editor agent stage (maic-agent)', async () => {
    useProviders({ routes: { 'maic-agent': 'anthropic:claude-opus-4' } });
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel('maic-agent')).toBe('anthropic:claude-opus-4');
  });

  it('returns undefined for a routable stage that is not listed', async () => {
    useProviders({ routes: { 'scene-content': 'openai:gpt-5.4' } });
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel('scene-actions')).toBeUndefined();
  });

  it('ignores unknown stage keys with a warning but keeps valid ones', async () => {
    const warn = vi.fn();
    vi.doMock('@/lib/logger', () => ({
      createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
    useProviders({
      routes: {
        'not-a-stage': 'openai:gpt-5.4',
        'scene-content': 'openai:gpt-5.4',
      },
    });
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel('not-a-stage')).toBeUndefined();
    expect(getStageModel('scene-content')).toBe('openai:gpt-5.4');
    expect(warn).toHaveBeenCalled();
  });

  it('ignores non-string route values', async () => {
    useProviders({
      routes: {
        'scene-content': 123,
        'pbl-chat': 'anthropic:claude-sonnet-4',
      },
    });
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel('scene-content')).toBeUndefined();
    expect(getStageModel('pbl-chat')).toBe('anthropic:claude-sonnet-4');
  });

  it('resolves a composite scene-content:<type> key', async () => {
    useProviders({ routes: { 'scene-content:quiz': 'openai:gpt-5.4' } });
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel('scene-content:quiz')).toBe('openai:gpt-5.4');
  });

  it('falls back from a composite key to the base stage', async () => {
    useProviders({ routes: { 'scene-content': 'openai:gpt-5.4-mini' } });
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel('scene-content:quiz')).toBe('openai:gpt-5.4-mini');
  });

  it('prefers the composite key over the base stage', async () => {
    useProviders({
      routes: {
        'scene-content': 'openai:gpt-5.4-mini',
        'scene-content:quiz': 'openai:gpt-5.4',
      },
    });
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel('scene-content:quiz')).toBe('openai:gpt-5.4');
    // a type without its own route falls back to the base scene-content route
    expect(getStageModel('scene-content:slide')).toBe('openai:gpt-5.4-mini');
  });

  it('ignores an unknown scene-content:<type> key with a warning', async () => {
    const warn = vi.fn();
    vi.doMock('@/lib/logger', () => ({
      createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
    useProviders({ routes: { 'scene-content:bogus': 'openai:gpt-5.4' } });
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel('scene-content:bogus')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('parses an object route value {model, thinking} via getStageRoute', async () => {
    useProviders({
      routes: {
        'scene-content': { model: 'openai:gpt-5.4', thinking: { effort: 'high' } },
      },
    });
    const { getStageRoute, getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageRoute('scene-content')).toEqual({
      model: 'openai:gpt-5.4',
      thinking: { effort: 'high' },
    });
    expect(getStageModel('scene-content')).toBe('openai:gpt-5.4');
  });

  it('parses an api and a contextWindow on an object route value', async () => {
    useProviders({
      routes: {
        'maic-agent-driver': {
          model: 'openai:gpt-5.6-luna',
          api: 'openai-completions',
          contextWindow: 32_000,
        },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('maic-agent-driver')).toEqual({
      model: 'openai:gpt-5.6-luna',
      api: 'openai-completions',
      contextWindow: 32_000,
    });
  });

  it('accepts dialect as an alias for api', async () => {
    useProviders({
      routes: {
        'maic-agent-driver': { model: 'openai:gpt-5.6-luna', dialect: 'openai-responses' },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('maic-agent-driver')).toEqual({
      model: 'openai:gpt-5.6-luna',
      api: 'openai-responses',
    });
  });

  it('prefers api over dialect and warns on conflict', async () => {
    const warn = vi.fn();
    vi.doMock('@/lib/logger', () => ({
      createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
    useProviders({
      routes: {
        'maic-agent-driver': {
          model: 'openai:gpt-5.6-luna',
          api: 'openai-completions',
          dialect: 'anthropic-messages',
        },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('maic-agent-driver')).toEqual({
      model: 'openai:gpt-5.6-luna',
      api: 'openai-completions',
    });
    expect(warn).toHaveBeenCalledWith(
      'Both api and dialect are set for stage "maic-agent-driver"; api wins.',
    );
  });

  it('uses dialect when api is invalid and warns that dialect won', async () => {
    const warn = vi.fn();
    vi.doMock('@/lib/logger', () => ({
      createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
    useProviders({
      routes: {
        'maic-agent-driver': {
          model: 'openai:gpt-5.6-luna',
          api: 123,
          dialect: 'openai-completions',
        },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('maic-agent-driver')).toEqual({
      model: 'openai:gpt-5.6-luna',
      api: 'openai-completions',
    });
    expect(warn).toHaveBeenCalledWith(
      'Invalid api for stage "maic-agent-driver" in the model routes; using dialect "openai-completions" instead.',
    );
  });

  it('ignores a non-string api with a warning but keeps the model', async () => {
    const warn = vi.fn();
    vi.doMock('@/lib/logger', () => ({
      createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
    useProviders({
      routes: {
        'maic-agent-driver': { model: 'openai:gpt-5.6-luna', api: 123 },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('maic-agent-driver')).toEqual({ model: 'openai:gpt-5.6-luna' });
    expect(warn).toHaveBeenCalled();
  });

  it('ignores a non-string dialect with a warning but keeps the model', async () => {
    const warn = vi.fn();
    vi.doMock('@/lib/logger', () => ({
      createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
    useProviders({
      routes: {
        'maic-agent-driver': { model: 'openai:gpt-5.6-luna', dialect: ['openai-completions'] },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('maic-agent-driver')).toEqual({ model: 'openai:gpt-5.6-luna' });
    expect(warn).toHaveBeenCalled();
  });

  it('floors a fractional positive contextWindow', async () => {
    useProviders({
      routes: {
        'maic-agent-driver': { model: 'openai:gpt-5.6-luna', contextWindow: 32_000.9 },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('maic-agent-driver')).toEqual({
      model: 'openai:gpt-5.6-luna',
      contextWindow: 32_000,
    });
  });

  it('drops a contextWindow that floors below 1 with a warning but keeps the model', async () => {
    const warn = vi.fn();
    vi.doMock('@/lib/logger', () => ({
      createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
    useProviders({
      routes: {
        'maic-agent-driver': { model: 'openai:gpt-5.6-luna', contextWindow: 0.5 },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('maic-agent-driver')).toEqual({ model: 'openai:gpt-5.6-luna' });
    expect(warn).toHaveBeenCalled();
  });

  it('drops a non-positive contextWindow with a warning but keeps the model', async () => {
    const warn = vi.fn();
    vi.doMock('@/lib/logger', () => ({
      createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
    useProviders({
      routes: {
        'maic-agent-driver': { model: 'openai:gpt-5.6-luna', contextWindow: 0 },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('maic-agent-driver')).toEqual({ model: 'openai:gpt-5.6-luna' });
    expect(warn).toHaveBeenCalled();
  });

  it('drops a non-numeric contextWindow with a warning but keeps the model', async () => {
    const warn = vi.fn();
    vi.doMock('@/lib/logger', () => ({
      createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
    useProviders({
      routes: {
        'maic-agent-driver': { model: 'openai:gpt-5.6-luna', contextWindow: '32000' },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('maic-agent-driver')).toEqual({ model: 'openai:gpt-5.6-luna' });
    expect(warn).toHaveBeenCalled();
  });

  it('routes the agent driver stage (maic-agent-driver)', async () => {
    useProviders({
      routes: {
        'maic-agent-driver': {
          model: 'openai:gpt-5.6-luna',
          api: 'openai-completions',
        },
      },
    });
    const { getStageModel } = await import('@/lib/server/model-routes');
    expect(getStageModel('maic-agent-driver')).toBe('openai:gpt-5.6-luna');
  });

  it('supports the full thinking config (budgetTokens/enabled/level/mode)', async () => {
    useProviders({
      routes: {
        'scene-content:interactive': {
          model: 'qwen:qwen3.7-plus',
          thinking: { enabled: true, budgetTokens: 8000 },
        },
        'scene-content:slide': {
          model: 'google:gemini-3-flash-preview',
          thinking: { level: 'low' },
        },
        'scene-content:quiz': {
          model: 'deepseek:deepseek-v4-pro',
          thinking: { mode: 'disabled', enabled: false },
        },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('scene-content:interactive')!.thinking).toEqual({
      enabled: true,
      budgetTokens: 8000,
    });
    expect(getStageRoute('scene-content:slide')!.thinking).toEqual({ level: 'low' });
    expect(getStageRoute('scene-content:quiz')!.thinking).toEqual({
      mode: 'disabled',
      enabled: false,
    });
  });

  it('treats a string route value as a model with no thinking', async () => {
    useProviders({ routes: { 'pbl-chat': 'anthropic:claude-sonnet-4' } });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('pbl-chat')).toEqual({ model: 'anthropic:claude-sonnet-4' });
  });

  it('drops invalid thinking fields with a warning but keeps the model', async () => {
    const warn = vi.fn();
    vi.doMock('@/lib/logger', () => ({
      createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
    useProviders({
      routes: {
        'scene-content': {
          model: 'openai:gpt-5.4',
          thinking: { effort: 'bogus', budgetTokens: 'x' },
        },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('scene-content')).toEqual({ model: 'openai:gpt-5.4' });
    expect(warn).toHaveBeenCalled();
  });

  it('ignores an object route value with no model string', async () => {
    useProviders({
      routes: {
        'scene-content': { thinking: { effort: 'high' } },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('scene-content')).toBeUndefined();
  });

  it('getStageRoute returns the matched composite entry (model+thinking) as a unit', async () => {
    useProviders({
      routes: {
        'scene-content': { model: 'openai:gpt-5.4-mini' },
        'scene-content:quiz': { model: 'openai:gpt-5.4', thinking: { effort: 'high' } },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('scene-content:quiz')).toEqual({
      model: 'openai:gpt-5.4',
      thinking: { effort: 'high' },
    });
    // unrouted type falls back to the base entry (no thinking there)
    expect(getStageRoute('scene-content:slide')).toEqual({ model: 'openai:gpt-5.4-mini' });
  });

  it('keeps vision and tools on an object route and ignores values that are not booleans', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useProviders({
      routes: {
        'scene-content': { model: 'omniroute:auto/best-vision', vision: true, tools: false },
        'pbl-chat': { model: 'omniroute:auto/best-chat', vision: 'yes', tools: 1 },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('scene-content')).toEqual({
      model: 'omniroute:auto/best-vision',
      vision: true,
      tools: false,
    });
    expect(getStageRoute('pbl-chat')).toEqual({ model: 'omniroute:auto/best-chat' });
  });

  it('getDefaultRoute returns the default model with what is known about it', async () => {
    const { getDefaultRoute } = await import('@/lib/server/model-routes');
    expect(getDefaultRoute()).toBeUndefined();
    useProviders({ defaultModel: 'openai:gpt-5.4-mini' });
    expect(getDefaultRoute()).toEqual({ model: 'openai:gpt-5.4-mini' });
    useProviders({
      defaultModel: 'omniroute:auto/best-chat',
      defaultValue: { model: 'omniroute:auto/best-chat', tools: true, contextWindow: 65536 },
    });
    expect(getDefaultRoute()).toEqual({
      model: 'omniroute:auto/best-chat',
      tools: true,
      contextWindow: 65536,
    });
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
        'pbl-chat',
        'chat-adapter',
        'generate-classroom',
        'web-search-query-rewrite',
        'maic-agent',
        'maic-agent-driver',
        'conversation-title',
      ]),
    );
  });

  it('parses a per-stage fallback from the route object', async () => {
    useProviders({
      routes: {
        'scene-content': {
          model: 'openai:gpt-5.4',
          fallback: 'qwen:deepseek-v4-pro',
        },
      },
    });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('scene-content')).toEqual({
      model: 'openai:gpt-5.4',
      fallback: 'qwen:deepseek-v4-pro',
    });
  });

  it('ignores a blank fallback with a warn', async () => {
    useProviders({ routes: { 'scene-content': { model: 'openai:gpt-5.4', fallback: '   ' } } });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('scene-content')).toEqual({ model: 'openai:gpt-5.4' });
  });

  it('keeps string routes without a fallback', async () => {
    useProviders({ routes: { 'scene-content': 'openai:gpt-5.4' } });
    const { getStageRoute } = await import('@/lib/server/model-routes');
    expect(getStageRoute('scene-content')).toEqual({ model: 'openai:gpt-5.4' });
  });

  it('never parses a fallback from the user x-model-routes header (server-only)', async () => {
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
