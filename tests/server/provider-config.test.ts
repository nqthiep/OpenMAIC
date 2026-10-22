import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  enabledProviderIds,
  enabledServerTTSProviderIds,
  getParallelSceneConcurrency,
  getServerASRProviders,
  getServerImageProviders,
  getServerPDFProviders,
  getServerProviders,
  getServerTTSProviders,
  getServerVideoProviders,
  getServerWebSearchProviders,
  isServerConfiguredProvider,
  isServerProviderDisabled,
  isServerTTSProviderDisabled,
  resolveApiKey,
  resolveASRApiKey,
  resolveASRBaseUrl,
  resolveASRModel,
  resolveBaseUrl,
  resolveImageApiKey,
  resolveImageBaseUrl,
  resolveImageModel,
  resolveManagedAliDocMindCredentials,
  resolvePDFApiKey,
  resolvePDFBaseUrl,
  resolveProxy,
  resolveQwenVoiceCloneModel,
  resolveServerASRProviderId,
  resolveServerImageProviderId,
  resolveServerMediaExtractorConfig,
  resolveServerVideoProviderId,
  resolveServerWebSearchProviderId,
  resolveTTSApiKey,
  resolveTTSBaseUrl,
  resolveTTSModel,
  resolveVideoBaseUrl,
  resolveVideoModel,
  resolveWebSearchApiKey,
  resolveWebSearchBaseUrl,
  resolveWebSearchModel,
} from '@/lib/server/provider-config';
import {
  ProviderConfigNotReady,
  resetProviderSnapshot,
} from '@/lib/server/provider-store/snapshot';

import { clearProviders, useProviders } from '../fixtures/provider-snapshot';

describe('provider-config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // An empty DATABASE_URL reads as "no database", whatever the host environment holds.
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('PARALLEL_SCENE_CONCURRENCY', '');
    vi.stubEnv('TTS_QWEN_VOICE_CLONE_MODEL', '');
    clearProviders();
  });

  afterEach(() => {
    clearProviders();
    vi.unstubAllEnvs();
  });

  describe('snapshot readiness', () => {
    it('throws ProviderConfigNotReady when a database is configured but nothing is loaded', () => {
      vi.stubEnv('DATABASE_URL', 'postgres://user:pw@localhost:5432/db');
      resetProviderSnapshot();
      expect(() => resolveApiKey('openai')).toThrow(ProviderConfigNotReady);
    });

    it('reads as nothing managed when no database is configured and nothing is installed', () => {
      expect(resolveApiKey('openai')).toBe('');
      expect(getServerProviders()).toEqual({});
    });
  });

  describe('resolveApiKey', () => {
    it('returns client key when provided', () => {
      expect(resolveApiKey('openai', 'sk-client')).toBe('sk-client');
    });

    it('returns the server key when no client key', () => {
      useProviders({ providers: { openai: { apiKey: 'sk-server' } } });
      expect(resolveApiKey('openai')).toBe('sk-server');
    });

    it('returns empty string when neither client nor server key exists', () => {
      expect(resolveApiKey('openai')).toBe('');
    });

    it('ignores client key for a server-managed provider (server is authoritative)', () => {
      useProviders({ providers: { openai: { apiKey: 'sk-server' } } });
      expect(resolveApiKey('openai', 'sk-client')).toBe('sk-server');
    });

    it('uses the client key for an unmanaged provider', () => {
      useProviders({ providers: { anthropic: { apiKey: 'sk-anthropic' } } });
      expect(resolveApiKey('openai', 'sk-client')).toBe('sk-client');
    });

    it('resolves each managed provider by its own id', () => {
      useProviders({
        providers: { anthropic: { apiKey: 'sk-anthropic' }, azure: { apiKey: 'azure-key' } },
      });
      expect(resolveApiKey('anthropic')).toBe('sk-anthropic');
      expect(resolveApiKey('azure')).toBe('azure-key');
    });

    it('returns empty string for unknown provider with nothing managed', () => {
      expect(resolveApiKey('nonexistent-provider')).toBe('');
    });
  });

  describe('getParallelSceneConcurrency', () => {
    it('defaults to 0 (serial) when unset', () => {
      expect(getParallelSceneConcurrency()).toBe(0);
    });

    it('reads a positive integer from the env var', () => {
      vi.stubEnv('PARALLEL_SCENE_CONCURRENCY', '3');
      expect(getParallelSceneConcurrency()).toBe(3);
    });

    it('clamps to a maximum of 10', () => {
      vi.stubEnv('PARALLEL_SCENE_CONCURRENCY', '50');
      expect(getParallelSceneConcurrency()).toBe(10);
    });

    it('treats zero, negative, and non-numeric values as off', () => {
      for (const value of ['0', '-2', 'abc']) {
        vi.stubEnv('PARALLEL_SCENE_CONCURRENCY', value);
        expect(getParallelSceneConcurrency(), `value=${value}`).toBe(0);
      }
    });
  });

  describe('resolveBaseUrl', () => {
    it('returns client URL for an unmanaged provider', () => {
      expect(resolveBaseUrl('openai', 'https://custom.api.com')).toBe('https://custom.api.com');
    });

    it('ignores client URL for a server-managed provider', () => {
      useProviders({
        providers: { openai: { apiKey: 'sk-server', baseUrl: 'https://proxy.example.com/v1' } },
      });
      expect(resolveBaseUrl('openai', 'https://client.example.com')).toBe(
        'https://proxy.example.com/v1',
      );
    });

    it('returns the server URL when no client URL', () => {
      useProviders({
        providers: { openai: { apiKey: 'sk-test', baseUrl: 'https://proxy.example.com/v1' } },
      });
      expect(resolveBaseUrl('openai')).toBe('https://proxy.example.com/v1');
    });

    it('returns undefined when neither client nor server URL exists', () => {
      expect(resolveBaseUrl('openai')).toBeUndefined();
    });

    it('does not fall back to the client URL when a managed provider has no URL', () => {
      useProviders({ providers: { openai: { apiKey: 'sk-server' } } });
      expect(resolveBaseUrl('openai', 'https://client.example.com')).toBeUndefined();
    });
  });

  describe('resolveProxy', () => {
    it('returns undefined when no proxy configured', () => {
      expect(resolveProxy('openai')).toBeUndefined();
    });

    it('returns the proxy URL of a managed provider', () => {
      useProviders({
        providers: { openai: { apiKey: 'sk-x', proxy: 'http://proxy.internal:8080' } },
      });
      expect(resolveProxy('openai')).toBe('http://proxy.internal:8080');
    });
  });

  describe('getServerProviders', () => {
    it('returns empty object when no providers configured', () => {
      expect(getServerProviders()).toEqual({});
    });

    it('returns allowed models but never the API key, base URL or proxy', () => {
      useProviders({
        providers: {
          openai: {
            apiKey: 'sk-secret',
            baseUrl: 'https://proxy.com/v1',
            proxy: 'http://proxy.internal:8080',
            models: ['gpt-4o', 'gpt-4o-mini'],
          },
        },
      });
      const providers = getServerProviders();

      expect(providers.openai).toEqual({ models: ['gpt-4o', 'gpt-4o-mini'] });
    });

    it('lists a managed provider without models as an empty entry', () => {
      useProviders({ providers: { openai: { apiKey: 'sk-secret', models: [] } } });
      expect(getServerProviders()).toEqual({ openai: {} });
    });

    it('lists multiple providers', () => {
      useProviders({
        providers: { openai: { apiKey: 'sk-openai' }, anthropic: { apiKey: 'sk-anthropic' } },
      });
      expect(Object.keys(getServerProviders())).toEqual(['openai', 'anthropic']);
    });

    it('keeps provider ids (openrouter, azure, atlascloud, tencent-hunyuan, xiaomi) as given', () => {
      useProviders({
        providers: {
          openrouter: { apiKey: 'k', models: ['deepseek/deepseek-v4-pro'] },
          azure: {
            apiKey: 'k',
            baseUrl: 'https://test-resource.openai.azure.com/openai',
            models: ['course-gpt-4o', 'course-gpt-5'],
          },
          atlascloud: {
            apiKey: 'k',
            baseUrl: 'https://api.atlascloud.ai/v1',
            models: ['qwen/qwen3.5-flash'],
          },
          'tencent-hunyuan': { apiKey: 'k', models: ['hy3-preview'] },
          xiaomi: { apiKey: 'k', models: ['mimo-v2.5-pro'] },
        },
      });
      const providers = getServerProviders();

      expect(providers.openrouter.models).toEqual(['deepseek/deepseek-v4-pro']);
      expect(providers.azure.models).toEqual(['course-gpt-4o', 'course-gpt-5']);
      expect(providers.atlascloud.models).toEqual(['qwen/qwen3.5-flash']);
      expect(resolveBaseUrl('atlascloud')).toBe('https://api.atlascloud.ai/v1');
      expect(providers['tencent-hunyuan'].models).toEqual(['hy3-preview']);
      expect(providers.xiaomi.models).toEqual(['mimo-v2.5-pro']);
      expect((providers.atlascloud as Record<string, unknown>).apiKey).toBeUndefined();
      expect((providers.atlascloud as Record<string, unknown>).baseUrl).toBeUndefined();
    });

    it('omits providers that are not in the snapshot', () => {
      useProviders({ providers: { anthropic: { apiKey: 'sk-a' } } });
      expect(getServerProviders().openai).toBeUndefined();
      expect(isServerConfiguredProvider('providers', 'openai')).toBe(false);
    });

    it('includes a keyless provider (Bedrock) with models and no API key', () => {
      useProviders({
        providers: { bedrock: { models: ['us.anthropic.claude-sonnet-5'] } },
      });

      expect(getServerProviders().bedrock).toEqual({ models: ['us.anthropic.claude-sonnet-5'] });
      expect(resolveApiKey('bedrock')).toBe('');
      expect(resolveBaseUrl('bedrock')).toBeUndefined();
    });
  });

  describe('resolveWebSearchApiKey', () => {
    it('returns client key first', () => {
      expect(resolveWebSearchApiKey('client-key')).toBe('client-key');
    });

    it('resolves the managed Tavily key for the bare call shape', () => {
      useProviders({ webSearch: { tavily: { apiKey: 'tvly-managed' } } });
      expect(resolveWebSearchApiKey()).toBe('tvly-managed');
    });

    it('resolves Bocha API key and base URL (managed flag only, no URL exposed)', () => {
      useProviders({
        webSearch: { bocha: { apiKey: 'bocha-key', baseUrl: 'https://proxy.example.com/bocha' } },
      });

      expect(resolveWebSearchApiKey('bocha', undefined)).toBe('bocha-key');
      expect(resolveWebSearchBaseUrl('bocha')).toBe('https://proxy.example.com/bocha');
      expect(getServerWebSearchProviders().bocha).toEqual({});
    });

    it('resolves Exa API key and base URL', () => {
      useProviders({
        webSearch: { exa: { apiKey: 'exa-key', baseUrl: 'https://proxy.example.com/exa' } },
      });

      expect(resolveWebSearchApiKey('exa', undefined)).toBe('exa-key');
      expect(resolveWebSearchBaseUrl('exa')).toBe('https://proxy.example.com/exa');
      expect(getServerWebSearchProviders().exa).toEqual({});
    });

    it('ignores client key and base URL for a server-managed Bocha provider', () => {
      useProviders({
        webSearch: { bocha: { apiKey: 'bocha-key', baseUrl: 'https://proxy.example.com/bocha' } },
      });

      expect(resolveWebSearchApiKey('bocha', 'bocha-client-key')).toBe('bocha-key');
      expect(resolveWebSearchBaseUrl('bocha', 'https://client.example.com')).toBe(
        'https://proxy.example.com/bocha',
      );
    });

    it('uses the client key and base URL for an unmanaged provider', () => {
      expect(resolveWebSearchApiKey('bocha', 'bocha-client-key')).toBe('bocha-client-key');
      expect(resolveWebSearchBaseUrl('bocha', 'https://client.example.com')).toBe(
        'https://client.example.com',
      );
    });

    it('resolves MiniMax web search API key and base URL', () => {
      useProviders({
        webSearch: {
          minimax: { apiKey: 'minimax-key', baseUrl: 'https://proxy.example.com/minimax' },
        },
      });

      expect(resolveWebSearchApiKey('minimax', undefined)).toBe('minimax-key');
      expect(resolveWebSearchBaseUrl('minimax')).toBe('https://proxy.example.com/minimax');
      expect(getServerWebSearchProviders().minimax).toEqual({});
    });

    it('resolves Claude web search key, base URL, and pinned model', () => {
      useProviders({
        webSearch: {
          claude: {
            apiKey: 'claude-key',
            baseUrl: 'https://proxy.example.com/anthropic',
            models: ['claude-sonnet-5', 'claude-opus-5'],
          },
        },
      });

      expect(resolveWebSearchApiKey('claude', undefined)).toBe('claude-key');
      expect(resolveWebSearchBaseUrl('claude')).toBe('https://proxy.example.com/anthropic');
      // Server-pinned model (first entry) is authoritative over the client model.
      expect(resolveWebSearchModel('claude', 'claude-haiku-4-5')).toBe('claude-sonnet-5');
      expect(getServerWebSearchProviders().claude).toEqual({});
    });

    it('lets the client model win when no Claude model is pinned server-side', () => {
      expect(resolveWebSearchModel('claude', 'claude-opus-5')).toBe('claude-opus-5');
      expect(resolveWebSearchModel('claude')).toBeUndefined();

      useProviders({ webSearch: { claude: { apiKey: 'claude-key' } } });
      expect(resolveWebSearchModel('claude', 'claude-opus-5')).toBe('claude-opus-5');
    });
  });

  describe('PDF providers', () => {
    it('lists a managed PDF provider that has only a baseUrl (e.g. mineru)', () => {
      useProviders({ pdf: { mineru: { baseUrl: 'http://localhost:8888' } } });

      expect(getServerPDFProviders().mineru).toEqual({});
      expect(resolvePDFBaseUrl('mineru')).toBe('http://localhost:8888');
      expect(resolvePDFApiKey('mineru')).toBe('');
    });

    it('lists MinerU Cloud with only an API key and no base URL', () => {
      useProviders({ pdf: { 'mineru-cloud': { apiKey: 'mineru-cloud-key' } } });

      expect(getServerPDFProviders()['mineru-cloud']).toEqual({});
      expect(resolvePDFApiKey('mineru-cloud')).toBe('mineru-cloud-key');
      expect(resolvePDFBaseUrl('mineru-cloud')).toBeUndefined();
    });

    it('ignores client credentials for a managed PDF provider and uses them otherwise', () => {
      useProviders({ pdf: { mineru: { baseUrl: 'http://localhost:8888' } } });

      expect(resolvePDFBaseUrl('mineru', 'http://client:1')).toBe('http://localhost:8888');
      expect(resolvePDFApiKey('mineru', 'client-key')).toBe('');
      expect(resolvePDFBaseUrl('unpdf', 'http://client:1')).toBe('http://client:1');
      expect(resolvePDFApiKey('unpdf', 'client-key')).toBe('client-key');
    });
  });

  describe('image and video provider metadata', () => {
    it('exposes the image base URL server-side but not in the listing', () => {
      useProviders({
        image: { 'openai-image': { apiKey: 'sk-img', baseUrl: 'https://proxy.example.com/v1' } },
      });

      expect(getServerImageProviders()['openai-image']).toEqual({});
      expect(resolveImageApiKey('openai-image')).toBe('sk-img');
      expect(resolveImageBaseUrl('openai-image')).toBe('https://proxy.example.com/v1');
    });

    it('exposes the video base URL server-side but not in the listing', () => {
      useProviders({
        video: {
          'grok-video': { apiKey: 'xai-secret', baseUrl: 'https://proxy.example.com/video' },
        },
      });

      expect(getServerVideoProviders()['grok-video']).toEqual({});
      expect(resolveVideoBaseUrl('grok-video')).toBe('https://proxy.example.com/video');
    });

    it('exposes server-pinned image models in getServerImageProviders', () => {
      useProviders({
        image: {
          seedream: {
            apiKey: 'sk-seedream',
            models: ['doubao-seedream-5.0-lite', 'doubao-seedream-5.0-pro'],
          },
        },
      });

      expect(getServerImageProviders().seedream).toEqual({
        models: ['doubao-seedream-5.0-lite', 'doubao-seedream-5.0-pro'],
      });
    });

    it('exposes server-pinned video models in getServerVideoProviders', () => {
      useProviders({
        video: {
          seedance: {
            apiKey: 'sk-seedance',
            models: ['doubao-seedance-2-0', 'doubao-seedance-3-0'],
          },
        },
      });

      expect(getServerVideoProviders().seedance).toEqual({
        models: ['doubao-seedance-2-0', 'doubao-seedance-3-0'],
      });
    });

    it('serves a keyless image provider (lemonade) from a base URL alone', () => {
      useProviders({ image: { lemonade: { baseUrl: 'http://localhost:13305/v1' } } });

      expect(isServerConfiguredProvider('image', 'lemonade')).toBe(true);
      expect(getServerImageProviders().lemonade).toBeDefined();
      expect(resolveImageApiKey('lemonade')).toBe('');
    });
  });

  describe('media model resolution', () => {
    it('allowlists the client image model against the pinned models', () => {
      useProviders({
        image: { seedream: { apiKey: 'sk-seedream', models: ['model-a', 'model-b'] } },
      });
      // Allowlisted client choice wins over the managed default.
      expect(resolveImageModel('seedream', 'model-b')).toBe('model-b');
      // Non-allowlisted client choice falls back to the managed default.
      expect(resolveImageModel('seedream', 'client-model')).toBe('model-a');
      expect(resolveImageModel('seedream')).toBe('model-a');
    });

    it('lets the client image model win when nothing is pinned server-side', () => {
      expect(resolveImageModel('seedream', 'client-model')).toBe('client-model');

      useProviders({ image: { seedream: { apiKey: 'sk-seedream' } } });
      expect(resolveImageModel('seedream', 'client-model')).toBe('client-model');
    });

    it('returns undefined for the image model when neither client nor server provides one', () => {
      expect(resolveImageModel('seedream')).toBeUndefined();
    });

    it('resolves the default image provider as the first server-configured one', () => {
      useProviders({
        image: { seedream: { apiKey: 'sk-seedream' }, 'grok-image': { apiKey: 'g' } },
      });
      expect(resolveServerImageProviderId()).toBe('seedream');
    });

    it('returns undefined for the default image provider when none is configured', () => {
      expect(resolveServerImageProviderId()).toBeUndefined();
    });

    it('pins the video model from server config and allowlists the client choice', () => {
      useProviders({ video: { seedance: { apiKey: 'sk-seedance', models: ['v1', 'v2'] } } });
      // Allowlisted client choice wins over the managed default.
      expect(resolveVideoModel('seedance', 'v2')).toBe('v2');
      // Non-allowlisted client choice falls back to the managed default.
      expect(resolveVideoModel('seedance', 'not-allowed')).toBe('v1');
      expect(resolveVideoModel('seedance')).toBe('v1');
    });

    it('lets the client video model win when nothing is pinned server-side', () => {
      expect(resolveVideoModel('seedance', 'client-model')).toBe('client-model');
    });

    it('returns undefined for the video model when neither client nor server provides one', () => {
      expect(resolveVideoModel('seedance')).toBeUndefined();
    });

    it('resolves the default video provider as the first server-configured one', () => {
      useProviders({ video: { seedance: { apiKey: 'sk-seedance' }, veo: { apiKey: 'sk-veo' } } });
      expect(resolveServerVideoProviderId()).toBe('seedance');
    });

    it('returns undefined for the default video provider when none is configured', () => {
      expect(resolveServerVideoProviderId()).toBeUndefined();
    });

    it('allowlists the client ASR model against the pinned models', () => {
      useProviders({
        asr: { 'openai-whisper': { apiKey: 'sk-asr', models: ['whisper-x', 'whisper-y'] } },
      });
      // Allowlisted client choice wins over the managed default.
      expect(resolveASRModel('openai-whisper', 'whisper-y')).toBe('whisper-y');
      // Non-allowlisted client choice falls back to the managed default.
      expect(resolveASRModel('openai-whisper', 'client-model')).toBe('whisper-x');
      expect(resolveASRModel('openai-whisper')).toBe('whisper-x');
    });

    it('lets the client ASR model win when nothing is pinned server-side', () => {
      expect(resolveASRModel('openai-whisper', 'client-model')).toBe('client-model');
    });

    it('returns undefined for the ASR model when neither client nor server provides one', () => {
      expect(resolveASRModel('openai-whisper')).toBeUndefined();
    });
  });

  describe('isServerConfiguredProvider', () => {
    it('is true only for operator-configured providers, per section', () => {
      useProviders({
        providers: { openai: { apiKey: 'sk-openai' } },
        video: { 'grok-video': { apiKey: 'xai-secret' } },
      });

      expect(isServerConfiguredProvider('providers', 'openai')).toBe(true);
      expect(isServerConfiguredProvider('providers', 'anthropic')).toBe(false);
      expect(isServerConfiguredProvider('video', 'grok-video')).toBe(true);
      // section-scoped: an LLM provider id is not a video provider
      expect(isServerConfiguredProvider('video', 'openai')).toBe(false);
    });
  });

  describe('getServerTTSProviders force-disable (#665)', () => {
    it('reports nothing when no TTS provider is configured or disabled', () => {
      expect(getServerTTSProviders()).toEqual({});
    });

    it('marks a configured TTS provider as managed (no disabled flag)', () => {
      useProviders({ tts: { 'openai-tts': { apiKey: 'sk-tts' } } });
      expect(getServerTTSProviders()['openai-tts']).toEqual({});
    });

    it('reports a disabled provider as disabled even when it has a key', () => {
      useProviders({
        tts: { 'openai-tts': { apiKey: 'sk-tts' } },
        disabled: { tts: ['openai-tts'] },
      });
      expect(getServerTTSProviders()['openai-tts']).toEqual({ disabled: true });
    });

    it('reports a disabled provider that has no entry (browser-native, client-only)', () => {
      useProviders({ disabled: { tts: ['browser-native-tts'] } });
      expect(getServerTTSProviders()['browser-native-tts']).toEqual({ disabled: true });
    });

    it('isServerTTSProviderDisabled reflects the force-disable set', () => {
      useProviders({
        tts: { 'openai-tts': { apiKey: 'sk-tts' } },
        disabled: { tts: ['openai-tts'] },
      });
      expect(isServerTTSProviderDisabled('openai-tts')).toBe(true);
      expect(isServerTTSProviderDisabled('qwen-tts')).toBe(false);
    });

    it('enabledServerTTSProviderIds drops disabled providers and browser-native', () => {
      useProviders({
        tts: {
          'openai-tts': { apiKey: 'a' },
          'qwen-tts': { apiKey: 'b' },
          'glm-tts': { apiKey: 'c' },
        },
        disabled: { tts: ['openai-tts', 'browser-native-tts'] },
      });
      expect(enabledServerTTSProviderIds()).toEqual(['qwen-tts', 'glm-tts']);
    });
  });

  describe('per-capability force-disable (#665)', () => {
    it('image: a configured provider is managed (no disabled flag)', () => {
      useProviders({ image: { 'openai-image': { apiKey: 'sk-img' } } });
      expect(getServerImageProviders()['openai-image']).toEqual({});
    });

    it('image: disabled wins even when the provider has a key', () => {
      useProviders({
        image: { 'openai-image': { apiKey: 'sk-img', models: ['gpt-image-1'] } },
        disabled: { image: ['openai-image'] },
      });
      expect(getServerImageProviders()['openai-image']).toEqual({ disabled: true });
    });

    it('image: a disabled provider with no entry (client-only ComfyUI) is listed as disabled', () => {
      useProviders({ disabled: { image: ['comfyui-image'] } });
      expect(getServerImageProviders()['comfyui-image']).toEqual({ disabled: true });
    });

    it('asr: disabled wins even when the provider has a key', () => {
      useProviders({
        asr: { 'openai-whisper': { apiKey: 'sk-asr' } },
        disabled: { asr: ['openai-whisper'] },
      });
      expect(getServerASRProviders()['openai-whisper']).toEqual({ disabled: true });
    });

    it('asr: a disabled client-only provider (browser-native) is listed as disabled', () => {
      useProviders({ disabled: { asr: ['browser-native'] } });
      expect(getServerASRProviders()['browser-native']).toEqual({ disabled: true });
    });

    it('video: disabled wins even when the provider has a key', () => {
      useProviders({
        video: { 'grok-video': { apiKey: 'xai-video' } },
        disabled: { video: ['grok-video'] },
      });
      expect(getServerVideoProviders()['grok-video']).toEqual({ disabled: true });
    });

    it('web-search: disabled wins even when the provider has a key', () => {
      useProviders({
        webSearch: { tavily: { apiKey: 'tvly-key' }, exa: { apiKey: 'exa-key' } },
        disabled: { webSearch: ['tavily', 'exa'] },
      });
      const listing = getServerWebSearchProviders();
      expect(listing.tavily).toEqual({ disabled: true });
      expect(listing.exa).toEqual({ disabled: true });
    });

    it('web-search: a keyless provider (SearXNG) can be disabled', () => {
      useProviders({
        webSearch: { searxng: { baseUrl: 'http://searxng.internal' } },
        disabled: { webSearch: ['searxng'] },
      });
      expect(getServerWebSearchProviders().searxng).toEqual({ disabled: true });
    });

    it('web-search: a built-in provider with no entry (Doubao) can be disabled', () => {
      useProviders({ disabled: { webSearch: ['doubao'] } });
      expect(getServerWebSearchProviders().doubao).toEqual({ disabled: true });
    });

    it('isServerProviderDisabled reflects the per-section force-disable set', () => {
      useProviders({
        image: { 'openai-image': { apiKey: 'sk-img' } },
        disabled: { image: ['openai-image'], video: ['grok-video'], asr: ['openai-whisper'] },
      });
      expect(isServerProviderDisabled('image', 'openai-image')).toBe(true);
      expect(isServerProviderDisabled('image', 'seedream')).toBe(false);
      expect(isServerProviderDisabled('video', 'grok-video')).toBe(true);
      expect(isServerProviderDisabled('asr', 'openai-whisper')).toBe(true);
      expect(isServerProviderDisabled('tts', 'openai-tts')).toBe(false);
    });
  });

  describe('server defaults skip force-disabled providers (#665)', () => {
    it('resolveServerImageProviderId skips a disabled provider', () => {
      useProviders({
        image: { 'openai-image': { apiKey: 'sk-1' }, 'grok-image': { apiKey: 'sk-2' } },
        disabled: { image: ['openai-image'] },
      });
      expect(resolveServerImageProviderId()).toBe('grok-image');
    });

    it('resolveServerImageProviderId returns undefined when every configured provider is disabled', () => {
      useProviders({
        image: { 'openai-image': { apiKey: 'sk-1' } },
        disabled: { image: ['openai-image'] },
      });
      expect(resolveServerImageProviderId()).toBeUndefined();
    });

    it('resolveServerImageProviderId ignores a disabled provider that has no entry', () => {
      useProviders({ disabled: { image: ['comfyui-image'] } });
      expect(resolveServerImageProviderId()).toBeUndefined();
    });

    it('resolveServerVideoProviderId skips a disabled provider', () => {
      useProviders({
        video: { 'grok-video': { apiKey: 'sk-1' }, kling: { apiKey: 'sk-2' } },
        disabled: { video: ['grok-video'] },
      });
      expect(resolveServerVideoProviderId()).toBe('kling');
    });

    it('resolveServerASRProviderId skips a disabled provider', () => {
      useProviders({
        asr: { 'openai-whisper': { apiKey: 'sk-1' }, 'qwen-asr': { apiKey: 'sk-2' } },
        disabled: { asr: ['openai-whisper'] },
      });
      expect(resolveServerASRProviderId()).toBe('qwen-asr');
    });

    it('web-search preference chain skips disabled providers', () => {
      useProviders({
        webSearch: { tavily: { apiKey: 'tvly' }, bocha: { apiKey: 'bocha' } },
        disabled: { webSearch: ['tavily'] },
      });
      // Tavily is the preferred default but disabled => bocha is chosen.
      expect(resolveServerWebSearchProviderId()).toBe('bocha');
    });

    it('web-search preference chain honors an enabled preferred provider', () => {
      useProviders({ webSearch: { tavily: { apiKey: 'tvly' }, bocha: { apiKey: 'bocha' } } });
      expect(resolveServerWebSearchProviderId()).toBe('tavily');
    });

    it('web-search preference chain honors a client-preferred provider when it is enabled', () => {
      useProviders({ webSearch: { tavily: { apiKey: 'tvly' }, bocha: { apiKey: 'bocha' } } });
      expect(resolveServerWebSearchProviderId('bocha')).toBe('bocha');
    });

    it('web-search preference chain skips a disabled client-preferred provider', () => {
      useProviders({
        webSearch: { tavily: { apiKey: 'tvly' }, bocha: { apiKey: 'bocha' } },
        disabled: { webSearch: ['tavily'] },
      });
      expect(resolveServerWebSearchProviderId('tavily')).toBe('bocha');
    });

    it('web-search preference chain returns undefined when every configured provider is disabled', () => {
      useProviders({
        webSearch: { tavily: { apiKey: 'tvly' } },
        disabled: { webSearch: ['tavily'] },
      });
      expect(resolveServerWebSearchProviderId()).toBeUndefined();
    });
  });

  describe('enabledProviderIds resolver (#665)', () => {
    it('returns only non-disabled entries of a capability listing', () => {
      expect(
        enabledProviderIds({
          'openai-image': { models: ['gpt-image-1'] },
          seedream: { disabled: true },
          'grok-image': {},
        }),
      ).toEqual(['openai-image', 'grok-image']);
    });

    it('keeps object-key order and drops nothing when nothing is disabled', () => {
      expect(enabledProviderIds({ a: {}, b: { models: [] }, c: { disabled: false } })).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('returns an empty list when every entry is force-disabled', () => {
      expect(enabledProviderIds({ a: { disabled: true }, b: { disabled: true } })).toEqual([]);
    });
  });

  describe('TTS resolution', () => {
    it('resolves a managed TTS key and ignores the client key', () => {
      useProviders({ tts: { 'openai-tts': { apiKey: 'sk-tts' } } });
      expect(resolveTTSApiKey('openai-tts', 'sk-client')).toBe('sk-tts');
      expect(resolveTTSApiKey('qwen-tts', 'sk-client')).toBe('sk-client');
    });

    it('pins the TTS model of a managed provider and ignores the client model', () => {
      useProviders({ tts: { 'openai-tts': { apiKey: 'sk-tts', models: ['tts-1', 'tts-1-hd'] } } });
      expect(resolveTTSModel('openai-tts', 'gpt-4o-mini-tts')).toBe('tts-1');
      expect(resolveTTSModel('openai-tts')).toBe('tts-1');
    });

    it('lets the client TTS model win when nothing is pinned', () => {
      useProviders({ tts: { 'openai-tts': { apiKey: 'sk-tts' } } });
      expect(resolveTTSModel('openai-tts', 'tts-1-hd')).toBe('tts-1-hd');
      expect(resolveTTSModel('openai-tts')).toBeUndefined();
    });

    it('prefers a managed base URL over the provider default', () => {
      useProviders({
        tts: { 'openai-tts': { apiKey: 'k', baseUrl: 'https://proxy.example.com/v1' } },
      });
      expect(resolveTTSBaseUrl('openai-tts', 'https://client.example.com')).toBe(
        'https://proxy.example.com/v1',
      );
    });
  });

  describe('Qwen TTS resolution', () => {
    it('uses the provider default base URL when none is configured or supplied', () => {
      expect(resolveTTSBaseUrl('qwen-tts')).toBe('https://dashscope.aliyuncs.com/api/v1');
    });

    it('maps VC sentinels to the resolved model and rejects pin bypasses', () => {
      useProviders({ tts: { 'qwen-tts': { apiKey: 'key', models: ['qwen3-tts-flash'] } } });
      vi.stubEnv('TTS_QWEN_VOICE_CLONE_MODEL', 'operator-vc-model');

      expect(resolveTTSModel('qwen-tts', 'qwen3-tts-vc-custom', 'clone-1')).toBe(
        'operator-vc-model',
      );
      expect(() => resolveTTSModel('qwen-tts', 'qwen3-tts-flash-other', 'Cherry')).toThrow(
        'not allowed',
      );
      expect(resolveTTSModel('qwen-tts', 'operator-vc-model', 'Cherry')).toBe('qwen3-tts-flash');
    });

    it('reads the VC override only from server-side resolution', () => {
      vi.stubEnv('TTS_QWEN_VOICE_CLONE_MODEL', 'operator-vc-model');
      expect(resolveQwenVoiceCloneModel()).toBe('operator-vc-model');
    });

    it('falls back to the default VC model when the override is unset', () => {
      expect(resolveQwenVoiceCloneModel()).toBeTruthy();
      expect(resolveQwenVoiceCloneModel()).not.toBe('operator-vc-model');
    });

    it('rejects catalog synthesis when the operator pins only the clone model', () => {
      useProviders({ tts: { 'qwen-tts': { apiKey: 'key', models: ['operator-vc-model'] } } });
      vi.stubEnv('TTS_QWEN_VOICE_CLONE_MODEL', 'operator-vc-model');

      expect(() => resolveTTSModel('qwen-tts', undefined, 'Cherry')).toThrow('not allowed');
    });

    it('lets the client model through when nothing is pinned', () => {
      useProviders({ tts: { 'qwen-tts': { apiKey: 'key' } } });
      expect(resolveTTSModel('qwen-tts', 'qwen3-tts-flash')).toBe('qwen3-tts-flash');
    });
  });

  describe('FunASR server configuration', () => {
    it('serves the keyless provider from a base URL', () => {
      useProviders({ asr: { 'funasr-asr': { baseUrl: 'http://localhost:8000/v1' } } });

      expect(getServerASRProviders()['funasr-asr']).toEqual({});
      expect(resolveASRApiKey('funasr-asr')).toBe('');
      expect(resolveASRBaseUrl('funasr-asr')).toBe('http://localhost:8000/v1');
    });

    it('keeps server config authoritative over a client base URL', () => {
      useProviders({ asr: { 'funasr-asr': { baseUrl: 'http://funasr.internal:8000/v1' } } });

      expect(resolveASRBaseUrl('funasr-asr', 'https://client.example.com/v1')).toBe(
        'http://funasr.internal:8000/v1',
      );
    });
  });

  describe('resolveManagedAliDocMindCredentials (AK/SK)', () => {
    it('resolves managed AK/SK without a base URL', () => {
      useProviders({
        pdf: { alidocmind: { accessKeyId: 'managed-ak', accessKeySecret: 'managed-sk' } },
      });

      expect(isServerConfiguredProvider('pdf', 'alidocmind')).toBe(true);
      expect(resolveManagedAliDocMindCredentials()).toEqual({
        accessKeyId: 'managed-ak',
        accessKeySecret: 'managed-sk',
        baseUrl: undefined,
      });
    });

    it('resolves managed AK/SK together with the base URL', () => {
      useProviders({
        pdf: {
          alidocmind: {
            accessKeyId: 'review-ak',
            accessKeySecret: 'review-sk',
            baseUrl: 'https://docmind-api.cn-hangzhou.aliyuncs.com',
          },
        },
      });

      expect(isServerConfiguredProvider('pdf', 'alidocmind')).toBe(true);
      expect(resolveManagedAliDocMindCredentials()).toEqual({
        accessKeyId: 'review-ak',
        accessKeySecret: 'review-sk',
        baseUrl: 'https://docmind-api.cn-hangzhou.aliyuncs.com',
      });
    });

    it('returns undefined when AliDocMind is not managed', () => {
      expect(resolveManagedAliDocMindCredentials()).toBeUndefined();
      expect(isServerConfiguredProvider('pdf', 'alidocmind')).toBe(false);
    });

    it('returns undefined when the managed entry lacks the AK/SK pair', () => {
      useProviders({
        pdf: {
          alidocmind: { baseUrl: 'https://docmind-api.cn-beijing.aliyuncs.com' },
        },
      });
      expect(resolveManagedAliDocMindCredentials()).toBeUndefined();

      useProviders({ pdf: { alidocmind: { accessKeyId: 'only-ak' } } });
      expect(resolveManagedAliDocMindCredentials()).toBeUndefined();
    });

    it('does not read ALIDOCMIND_* env vars', () => {
      vi.stubEnv('ALIDOCMIND_ACCESS_KEY_ID', 'env-ak');
      vi.stubEnv('ALIDOCMIND_ACCESS_KEY_SECRET', 'env-sk');
      expect(resolveManagedAliDocMindCredentials()).toBeUndefined();
    });
  });

  describe('resolveServerMediaExtractorConfig', () => {
    it('carries the managed AK/SK and never allows the env fallback', () => {
      useProviders({
        pdf: {
          alidocmind: {
            accessKeyId: 'managed-ak',
            accessKeySecret: 'managed-sk',
            baseUrl: 'https://docmind-api.cn-hangzhou.aliyuncs.com',
          },
        },
      });

      expect(resolveServerMediaExtractorConfig()).toEqual({
        providerId: '',
        accessKeyId: 'managed-ak',
        accessKeySecret: 'managed-sk',
        baseUrl: 'https://docmind-api.cn-hangzhou.aliyuncs.com',
        allowEnvFallback: false,
      });
    });

    it('carries no credentials when AliDocMind is not managed, and still disallows the env fallback', () => {
      const config = resolveServerMediaExtractorConfig();
      expect(config.accessKeyId).toBeUndefined();
      expect(config.accessKeySecret).toBeUndefined();
      expect(config.allowEnvFallback).toBe(false);
    });
  });
});
