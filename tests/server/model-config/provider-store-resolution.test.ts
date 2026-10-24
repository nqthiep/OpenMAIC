/**
 * Models resolved through the real bridge: what an administrator saved in the provider store
 * (providers, default model, stage routes) decides the model of a stage, as it did before the
 * slot configuration of RFC #1701 arrived. Only `getModel` is stubbed, recording its arguments, so
 * no provider client is built.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearProviders, useProviders } from '../../fixtures/provider-snapshot';

const mocks = vi.hoisted(() => ({
  getModelCalls: [] as Array<Record<string, unknown>>,
  catalogInfo: undefined as unknown,
}));

vi.mock('@/lib/ai/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/providers')>();
  return {
    ...actual,
    getModel: (args: Record<string, unknown>) => {
      mocks.getModelCalls.push(args);
      return { model: { id: args.modelId }, modelInfo: mocks.catalogInfo };
    },
  };
});
vi.mock('@/lib/server/ssrf-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/ssrf-guard')>()),
  validateUrlForSSRF: async () => null,
  validateClientBaseUrl: async () => null,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const PROVIDERS = {
  openai: { apiKey: 'sk-openai' },
  omniroute: { apiKey: 'sk-omni', baseUrl: 'http://omniroute:20129/v1' },
};

beforeEach(async () => {
  vi.resetModules();
  mocks.getModelCalls.length = 0;
  mocks.catalogInfo = undefined;
  vi.stubEnv('DATABASE_URL', '');
  const runtime = await import('@/lib/server/model-config/runtime');
  runtime.setDeploymentConfigForTests();
  runtime.setWorkspaceLayerLoaderForTests(async () => null);
});

afterEach(async () => {
  const runtime = await import('@/lib/server/model-config/runtime');
  runtime.setDeploymentConfigForTests();
  runtime.setWorkspaceLayerLoaderForTests();
  clearProviders();
  vi.unstubAllEnvs();
});

describe('resolveModel over the provider store', () => {
  it('uses the route of the stage, with the operator key, and marks it managed', async () => {
    useProviders({
      providers: PROVIDERS,
      defaultModel: 'openai:gpt-5.4-mini',
      routes: { 'scene-content': 'openai:gpt-5.4' },
    });
    const { resolveModel } = await import('@/lib/server/resolve-model');
    const r = await resolveModel({ stage: 'scene-content', workspaceId: 'user:alice' });
    expect(r).toMatchObject({
      modelString: 'openai:gpt-5.4',
      apiKey: 'sk-openai',
      managedKey: true,
      serverManaged: true,
    });
  });

  it('inherits the route of the parent stage for a scene type without its own', async () => {
    useProviders({
      providers: PROVIDERS,
      routes: { 'scene-content': 'openai:gpt-5.4', 'scene-content:quiz': 'openai:gpt-5.4-mini' },
    });
    const { resolveModel } = await import('@/lib/server/resolve-model');
    expect((await resolveModel({ stage: 'scene-content:quiz' })).modelString).toBe(
      'openai:gpt-5.4-mini',
    );
    expect((await resolveModel({ stage: 'scene-content:slide' })).modelString).toBe(
      'openai:gpt-5.4',
    );
  });

  it('keeps a route over the model a request names, and uses the default for the other stages', async () => {
    useProviders({
      providers: PROVIDERS,
      defaultModel: 'openai:gpt-5.4-mini',
      routes: { 'scene-content': 'openai:gpt-5.4' },
    });
    const { resolveModel } = await import('@/lib/server/resolve-model');
    // A routed stage ignores the request's model and its key.
    const routed = await resolveModel({
      stage: 'scene-content',
      modelString: 'openai:gpt-5.6',
      apiKey: 'client-key',
    });
    expect(routed).toMatchObject({ modelString: 'openai:gpt-5.4', apiKey: 'sk-openai' });
    // An unrouted stage uses the default model. Once the server configures providers, a request
    // cannot name its own model (decision D3: only the administrator chooses models).
    expect(
      (await resolveModel({ stage: 'scene-actions', modelString: 'openai:gpt-5.6' })).modelString,
    ).toBe('openai:gpt-5.4-mini');
  });

  it('gives the stages that share a slot their own routes', async () => {
    useProviders({
      providers: PROVIDERS,
      routes: {
        'chat-adapter': 'omniroute:auto/best-chat',
        'pbl-v2-runtime': 'omniroute:auto/best-chat',
        'quiz-grade': 'omniroute:auto/best-grader',
        'pbl-v2-runtime:evaluate': 'omniroute:auto/best-grader',
      },
    });
    const { resolveModel } = await import('@/lib/server/resolve-model');
    const modelOf = async (stage: Parameters<typeof resolveModel>[0]['stage']) =>
      (await resolveModel({ stage })).modelString;
    expect(await modelOf('chat-adapter')).toBe('omniroute:auto/best-chat');
    expect(await modelOf('pbl-v2-runtime')).toBe('omniroute:auto/best-chat');
    // A runtime endpoint without a route of its own follows the base stage.
    expect(await modelOf('pbl-v2-runtime:instructor')).toBe('omniroute:auto/best-chat');
    expect(await modelOf('quiz-grade')).toBe('omniroute:auto/best-grader');
    expect(await modelOf('pbl-v2-runtime:evaluate')).toBe('omniroute:auto/best-grader');
  });

  it('follows a change an administrator saves, with no restart', async () => {
    useProviders({ providers: PROVIDERS, routes: { 'scene-content': 'openai:gpt-5.4' } });
    const { resolveModel } = await import('@/lib/server/resolve-model');
    expect((await resolveModel({ stage: 'scene-content' })).modelString).toBe('openai:gpt-5.4');
    // The store installs a new snapshot object when it reloads.
    useProviders({ providers: PROVIDERS, routes: { 'scene-content': 'openai:gpt-5.6' } });
    expect((await resolveModel({ stage: 'scene-content' })).modelString).toBe('openai:gpt-5.6');
    useProviders({ providers: PROVIDERS, routes: {} });
    await expect(resolveModel({ stage: 'scene-content' })).rejects.toThrow(
      /No model is configured/,
    );
  });

  it('takes vision, tools and context window of a model the catalog does not describe', async () => {
    useProviders({
      providers: PROVIDERS,
      routes: {
        'scene-content': {
          model: 'omniroute:auto/best-vision',
          vision: true,
          tools: false,
          contextWindow: 200_000,
        },
      },
    });
    const { resolveModel } = await import('@/lib/server/resolve-model');
    const r = await resolveModel({ stage: 'scene-content' });
    expect(r.modelInfo).toEqual({
      id: 'auto/best-vision',
      name: 'auto/best-vision',
      contextWindow: 200_000,
      capabilities: { streaming: true, vision: true, tools: false },
    });
    // The catalog wins when it knows the model.
    mocks.catalogInfo = { id: 'auto/best-vision', name: 'Known', capabilities: { vision: false } };
    expect((await resolveModel({ stage: 'scene-content' })).modelInfo).toBe(mocks.catalogInfo);
  });

  it('carries the route thinking config onto the resolved model', async () => {
    useProviders({
      providers: PROVIDERS,
      routes: { 'scene-content': { model: 'openai:gpt-5.4', thinking: { effort: 'high' } } },
    });
    const { resolveModel } = await import('@/lib/server/resolve-model');
    const r = await resolveModel({ stage: 'scene-content', thinkingConfig: { effort: 'low' } });
    expect(r.thinkingConfig).toEqual({ effort: 'high' });
  });

  it('refuses a model a request names without a stage, once the server configures providers', async () => {
    useProviders({ providers: PROVIDERS, routes: { 'scene-content': 'openai:gpt-5.4' } });
    const { resolveModel, REQUEST_PROVIDERS_REFUSED } = await import('@/lib/server/resolve-model');
    await expect(resolveModel({ modelString: 'openai:gpt-5.6' })).rejects.toThrow(
      REQUEST_PROVIDERS_REFUSED,
    );
  });

  it('leaves a server with nothing configured to the model the request names', async () => {
    useProviders({});
    const { resolveModel } = await import('@/lib/server/resolve-model');
    const r = await resolveModel({
      stage: 'scene-content',
      modelString: 'openai:gpt-5.6',
      apiKey: 'client-key',
    });
    expect(r).toMatchObject({ modelString: 'openai:gpt-5.6', apiKey: 'client-key' });
    expect(r.managedKey).toBe(false);
  });

  it('resolves the agent slot from the agent driver route only', async () => {
    useProviders({
      providers: PROVIDERS,
      defaultModel: 'openai:gpt-5.4-mini',
      routes: {
        'scene-content': 'openai:gpt-5.4',
        'maic-agent-driver': {
          model: 'omniroute:auto/best-chat',
          api: 'openai-completions',
          contextWindow: 65_536,
        },
      },
    });
    const { lookupSlot } = await import('@/lib/server/model-config/runtime');
    const agent = await lookupSlot('agent', 'user:alice');
    expect(agent).toMatchObject({
      status: 'assigned',
      providerId: 'omniroute',
      modelId: 'auto/best-chat',
      api: 'openai-completions',
      contextWindow: 65_536,
    });

    useProviders({
      providers: PROVIDERS,
      defaultModel: 'openai:gpt-5.4-mini',
      routes: { 'scene-content': 'openai:gpt-5.4' },
    });
    // No driver route: the agent is off, not the default model.
    expect((await lookupSlot('agent', 'user:alice')).status).toBe('disabled');
  });
});
