import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BARE_MODEL_ID_DEPRECATION_MSG } from '@/lib/ai/providers';
import { setProviderSnapshot } from '@/lib/server/provider-store/snapshot';
import { emptySnapshot } from '@/lib/server/provider-store/types';
import { clearProviders, useProviders } from '../fixtures/provider-snapshot';

// config-validation reads env directly and the provider snapshot (installed per case with
// useProviders). fs is mocked so a host-machine server-providers.yml can never leak into tests,
// and so a case can pretend one is in the working directory.
let yamlOverride: string | null = null;

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const isYaml = (p: unknown) => typeof p === 'string' && p.endsWith('server-providers.yml');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => (isYaml(p) ? yamlOverride !== null : actual.existsSync(p)),
      readFileSync: (p: string, ...args: unknown[]) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isYaml(p) ? (yamlOverride ?? '') : (actual.readFileSync as any)(p, ...args),
    },
    existsSync: (p: string) => (isYaml(p) ? yamlOverride !== null : actual.existsSync(p)),
    readFileSync: (p: string, ...args: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isYaml(p) ? (yamlOverride ?? '') : (actual.readFileSync as any)(p, ...args),
  };
});

/** Env names that config-validation reads or reports as ignored. */
const IGNORED_ENV_NAME = /(_API_KEY|^DEFAULT_MODEL|^MODEL_ROUTES)$/;

/** A valid master key for stored provider secrets (32 bytes, base64). */
const MASTER_KEY = Buffer.alloc(32, 7).toString('base64');

function clearConfigEnv() {
  for (const name of Object.keys(process.env)) {
    if (IGNORED_ENV_NAME.test(name)) delete process.env[name];
  }
  delete process.env.OPENMAIC_AGENT_RUNTIME_ENABLED;
  delete process.env.DATABASE_URL;
  delete process.env.PROVIDER_SECRET_KEY;
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_COOKIE_SECRET;
  delete process.env.PUBLIC_APP_ORIGIN;
}

describe('validateServerConfig — warning matrix', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    clearConfigEnv();
    clearProviders();
    yamlOverride = null;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    clearConfigEnv();
    clearProviders();
  });

  it('emits no warnings when nothing is configured', async () => {
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when the access code has no cookie secret, since the cookie is then signed with the code', async () => {
    vi.stubEnv('ACCESS_CODE', 'a-long-shared-code');
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('ACCESS_COOKIE_SECRET');
  });

  it('warns on a short access code by length only, never echoing the code', async () => {
    vi.stubEnv('ACCESS_CODE', 'hunter2');
    vi.stubEnv('ACCESS_COOKIE_SECRET', 'x'.repeat(32));
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain('7 characters');
    expect(message).not.toContain('hunter2');
  });

  it('warns that server keys are spendable without an access code, naming providers and not key values', async () => {
    useProviders({ providers: { openai: { apiKey: 'sk-secret-value-123' } } });
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    const messages = warnSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    const managed = messages.find((message: string) => message.includes('ACCESS_CODE is not set'));
    expect(managed).toBeDefined();
    expect(managed).toContain('openai');
    expect(messages.join('\n')).not.toContain('sk-secret-value-123');
  });

  it('does not warn about server keys once an access code is set', async () => {
    useProviders({ providers: { openai: { apiKey: 'sk-test' } } });
    vi.stubEnv('ACCESS_CODE', 'a-long-shared-code');
    vi.stubEnv('ACCESS_COOKIE_SECRET', 'x'.repeat(32));
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns in production when PUBLIC_APP_ORIGIN is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ACCESS_CODE', 'a-long-shared-code');
    vi.stubEnv('ACCESS_COOKIE_SECRET', 'x'.repeat(32));
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('PUBLIC_APP_ORIGIN');
  });

  it('warns on a PUBLIC_APP_ORIGIN that is not a bare origin', async () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'classroom.example.edu');
    vi.stubEnv('ACCESS_CODE', 'a-long-shared-code');
    vi.stubEnv('ACCESS_COOKIE_SECRET', 'x'.repeat(32));
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('PUBLIC_APP_ORIGIN must be an origin');
  });

  it('emits no warnings on a fully valid config', async () => {
    useProviders({
      providers: { openai: { apiKey: 'sk-test' }, anthropic: { apiKey: 'sk-test' } },
      defaultModel: 'openai:gpt-5.4-mini',
      routes: {
        'scene-content': 'openai:gpt-5.4',
        'pbl-chat': { model: 'anthropic:claude-sonnet-4', thinking: { enabled: false } },
      },
    });
    vi.stubEnv('ACCESS_CODE', 'a-long-shared-code');
    vi.stubEnv('ACCESS_COOKIE_SECRET', 'x'.repeat(32));
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns naming an unknown stage key (typo detection)', async () => {
    useProviders({ routes: { 'scene-contnet': 'openai:gpt-5.4' } });
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('scene-contnet');
  });

  it('warns for an unknown provider prefix in a route', async () => {
    useProviders({ routes: { 'scene-content': 'anhtropic:claude-sonnet-4' } });
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('anhtropic');
  });

  it('warns when a routed provider has no API key configured', async () => {
    useProviders({ routes: { 'scene-content': 'deepseek:deepseek-v4-pro' } });
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('deepseek');
    expect(String(warnSpy.mock.calls[0][0])).toContain('API key');
  });

  it('does not warn about a keyless provider (ollama)', async () => {
    useProviders({ routes: { 'scene-content': 'ollama:llama3.3' } });
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits the deprecation warning for a bare model id in a route', async () => {
    useProviders({ routes: { 'scene-content': 'gpt-5.4' } });
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain(BARE_MODEL_ID_DEPRECATION_MSG);
  });

  it('emits the deprecation warning for a bare default model', async () => {
    useProviders({ defaultModel: 'gpt-5.4' });
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain(BARE_MODEL_ID_DEPRECATION_MSG);
  });

  it('warns softly when the default model points at a provider with no server key (client keys still work)', async () => {
    useProviders({ defaultModel: 'deepseek:deepseek-v4-pro' });
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('deepseek');
    // Unrouted sites honor client-supplied keys, so the message must not claim requests will fail.
    expect(String(warnSpy.mock.calls[0][0])).toContain('client supplies its own key');
  });

  it('does not throw on garbage config (warn-only)', async () => {
    useProviders({
      routes: { 'scene-content': { model: 42 }, 'pbl-chat': ['x'] },
      defaultModel: ':::::',
    });
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    expect(() => validateServerConfig()).not.toThrow();
  });

  it('warns that a leftover server-providers.yml is ignored', async () => {
    yamlOverride = 'providers:\n  deepseek:\n    apiKey: sk-yaml\n';
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain('server-providers.yml is ignored');
    expect(message).not.toContain('sk-yaml');
  });

  it('warns once naming leftover provider env vars, never their values', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-leftover-value');
    vi.stubEnv('TTS_OPENAI_API_KEY', 'sk-leftover-tts');
    vi.stubEnv('DEFAULT_MODEL', 'openai:gpt-5.4');
    vi.stubEnv('MODEL_ROUTES', '{"scene-content":"openai:gpt-5.4"}');
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain('are ignored');
    for (const name of ['OPENAI_API_KEY', 'TTS_OPENAI_API_KEY', 'DEFAULT_MODEL', 'MODEL_ROUTES']) {
      expect(message).toContain(name);
    }
    expect(message).not.toContain('sk-leftover');
  });

  it('does not let a leftover provider env var configure anything', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-leftover-value');
    vi.stubEnv('DEFAULT_MODEL', 'openai:gpt-5.4');
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    const messages = warnSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    // Only the "ignored" note: no routes, no managed providers, so nothing else to warn about.
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('are ignored');
  });

  it('warns once per distinct problem when a config has several', async () => {
    useProviders({
      routes: {
        'scene-contnet': 'openai:gpt-5.4', // unknown stage
        'scene-content': 'anhtropic:claude-sonnet-4', // unknown provider
        'pbl-chat': 'claude-sonnet-4', // bare id
      },
    });
    const { validateServerConfig } = await import('@/lib/server/config-validation');
    validateServerConfig();
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  describe('stored provider secrets', () => {
    it('warns when DATABASE_URL is set without PROVIDER_SECRET_KEY', async () => {
      vi.stubEnv('DATABASE_URL', 'postgres://store');
      const { validateServerConfig } = await import('@/lib/server/config-validation');
      validateServerConfig();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('PROVIDER_SECRET_KEY is not set');
    });

    it('warns when PROVIDER_SECRET_KEY is malformed, without echoing it', async () => {
      vi.stubEnv('DATABASE_URL', 'postgres://store');
      vi.stubEnv('PROVIDER_SECRET_KEY', 'not-a-real-key');
      const { validateServerConfig } = await import('@/lib/server/config-validation');
      validateServerConfig();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0][0]);
      expect(message).toContain('PROVIDER_SECRET_KEY');
      expect(message).not.toContain('not-a-real-key');
    });

    it('does not check the master key without a database', async () => {
      const { validateServerConfig } = await import('@/lib/server/config-validation');
      validateServerConfig();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn with a database and a valid master key', async () => {
      vi.stubEnv('DATABASE_URL', 'postgres://store');
      vi.stubEnv('PROVIDER_SECRET_KEY', MASTER_KEY);
      const { validateServerConfig } = await import('@/lib/server/config-validation');
      validateServerConfig();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('names the stored secrets that cannot be decrypted', async () => {
      vi.stubEnv('DATABASE_URL', 'postgres://store');
      vi.stubEnv('PROVIDER_SECRET_KEY', MASTER_KEY);
      vi.stubEnv('ACCESS_CODE', 'a-long-shared-code');
      vi.stubEnv('ACCESS_COOKIE_SECRET', 'x'.repeat(32));
      setProviderSnapshot({
        ...emptySnapshot(),
        unreadable: [
          { section: 'providers', providerId: 'openai' },
          { section: 'tts', providerId: 'openai-tts' },
        ],
      });
      const { validateServerConfig } = await import('@/lib/server/config-validation');
      validateServerConfig();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0][0]);
      expect(message).toContain('2 stored provider secret(s) cannot be decrypted');
      expect(message).toContain('providers/openai');
      expect(message).toContain('tts/openai-tts');
    });
  });

  describe('agent runtime configuration', () => {
    it('warns when the runtime flag is set without DATABASE_URL', async () => {
      vi.stubEnv('OPENMAIC_AGENT_RUNTIME_ENABLED', 'true');
      const { validateServerConfig } = await import('@/lib/server/config-validation');
      validateServerConfig();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0][0]);
      expect(message).toContain('OPENMAIC_AGENT_RUNTIME_ENABLED');
      expect(message).toContain('DATABASE_URL');
    });

    it('warns when the runtime flag is set and DATABASE_URL is blank', async () => {
      vi.stubEnv('OPENMAIC_AGENT_RUNTIME_ENABLED', 'true');
      vi.stubEnv('DATABASE_URL', '   ');
      const { validateServerConfig } = await import('@/lib/server/config-validation');
      validateServerConfig();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('DATABASE_URL');
    });

    it('does not warn when the runtime flag is set with DATABASE_URL present', async () => {
      vi.stubEnv('OPENMAIC_AGENT_RUNTIME_ENABLED', 'true');
      vi.stubEnv('DATABASE_URL', 'postgres://runtime');
      vi.stubEnv('PROVIDER_SECRET_KEY', MASTER_KEY);
      const { validateServerConfig } = await import('@/lib/server/config-validation');
      validateServerConfig();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn when the runtime flag is off even without DATABASE_URL', async () => {
      // This is the no-DB default deployment: flag unset, no database. It must
      // boot silently — the warning is for the MISCONFIGURED state only.
      const { validateServerConfig } = await import('@/lib/server/config-validation');
      validateServerConfig();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

describe('parseModelString — request-derived strings never warn', () => {
  it('resolves bare and prefixed ids without logging (client input must not drive log volume)', async () => {
    vi.resetModules();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { parseModelString } = await import('@/lib/ai/providers');

      expect(parseModelString('gpt-5.5')).toEqual({ providerId: 'openai', modelId: 'gpt-5.5' });
      expect(parseModelString('anthropic:claude-sonnet-4')).toEqual({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warnBareModelIdDeprecation dedupes per unique config-site id', async () => {
    vi.resetModules();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { warnBareModelIdDeprecation } = await import('@/lib/ai/providers');

      expect(warnBareModelIdDeprecation('gpt-5.5', 'DEFAULT_MODEL')).toBe(true);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain(BARE_MODEL_ID_DEPRECATION_MSG);

      expect(warnBareModelIdDeprecation('gpt-5.5', 'DEFAULT_MODEL')).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      expect(warnBareModelIdDeprecation('gpt-4.1', 'MODEL_ROUTES stage "pbl-chat"')).toBe(true);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
