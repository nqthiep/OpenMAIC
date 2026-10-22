import { describe, expect, it } from 'vitest';

import { buildSnapshot, isCredentialComplete } from '@/lib/server/provider-store/build-config';
import type { CredentialRecord } from '@/lib/server/provider-store/types';

function row(
  partial: Partial<CredentialRecord> & Pick<CredentialRecord, 'section' | 'providerId'>,
): CredentialRecord {
  return {
    enabled: true,
    secret: {},
    version: 1,
    updatedBy: 'root',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('isCredentialComplete', () => {
  it('needs a key for an ordinary provider', () => {
    expect(
      isCredentialComplete(row({ section: 'providers', providerId: 'openai', secret: {} })),
    ).toBe(false);
    expect(
      isCredentialComplete(
        row({ section: 'providers', providerId: 'openai', secret: { apiKey: 'k' } }),
      ),
    ).toBe(true);
  });

  it('accepts a base URL alone for a keyless provider', () => {
    expect(
      isCredentialComplete(
        row({ section: 'providers', providerId: 'ollama', baseUrl: 'http://ollama:11434' }),
      ),
    ).toBe(true);
    expect(
      isCredentialComplete(
        row({ section: 'providers', providerId: 'openai', baseUrl: 'http://x' }),
      ),
    ).toBe(false);
  });

  it('treats a Bedrock row as complete', () => {
    expect(isCredentialComplete(row({ section: 'providers', providerId: 'bedrock' }))).toBe(true);
  });

  it('needs a base URL for a PDF provider, except one with a default endpoint', () => {
    expect(
      isCredentialComplete(row({ section: 'pdf', providerId: 'mineru', baseUrl: 'http://m' })),
    ).toBe(true);
    expect(isCredentialComplete(row({ section: 'pdf', providerId: 'mineru' }))).toBe(false);
    expect(
      isCredentialComplete(
        row({ section: 'pdf', providerId: 'mineru-cloud', secret: { apiKey: 'k' } }),
      ),
    ).toBe(true);
  });

  it('needs both halves of an AccessKey pair for AliDocMind', () => {
    const base = { section: 'pdf', providerId: 'alidocmind' } as const;
    expect(isCredentialComplete(row({ ...base, secret: { accessKeyId: 'id' } }))).toBe(false);
    expect(
      isCredentialComplete(row({ ...base, secret: { accessKeyId: 'id', accessKeySecret: 's' } })),
    ).toBe(true);
  });
});

describe('buildSnapshot', () => {
  it('serves complete rows and skips incomplete ones', () => {
    const { config } = buildSnapshot(
      [
        row({
          section: 'providers',
          providerId: 'openai',
          secret: { apiKey: 'sk', proxy: 'http://p' },
          models: [' gpt-4o ', ''],
        }),
        row({ section: 'tts', providerId: 'openai-tts' }),
      ],
      [],
    );
    expect(config.providers.openai).toMatchObject({
      apiKey: 'sk',
      proxy: 'http://p',
      models: ['gpt-4o'],
    });
    expect(config.tts['openai-tts']).toBeUndefined();
  });

  it('records a switched-off provider, with or without a key', () => {
    const { config } = buildSnapshot(
      [
        row({ section: 'tts', providerId: 'browser-native-tts', enabled: false }),
        row({ section: 'image', providerId: 'seedream', enabled: false, secret: { apiKey: 'k' } }),
      ],
      [],
    );
    expect(config.disabled.tts.has('browser-native-tts')).toBe(true);
    expect(config.disabled.image.has('seedream')).toBe(true);
    expect(config.image.seedream).toBeDefined();
  });

  it('never half-serves a row whose secret cannot be read', () => {
    const { config } = buildSnapshot(
      [
        row({ section: 'providers', providerId: 'ollama', baseUrl: 'http://ollama:11434' }),
        row({ section: 'tts', providerId: 'openai-tts' }),
      ],
      [],
      [
        { section: 'providers', providerId: 'ollama' },
        { section: 'tts', providerId: 'openai-tts' },
      ],
    );
    // Still managed (a client's key cannot take over), with no key and no base URL.
    expect(config.providers.ollama).toEqual({ apiKey: '' });
    // A switchable provider is switched off.
    expect(config.disabled.tts.has('openai-tts')).toBe(true);
    expect(config.tts['openai-tts']).toBeUndefined();
  });

  it('splits the default model from the stage routes', () => {
    const { routing } = buildSnapshot(
      [],
      [
        { stage: 'default', value: { model: ' openai:gpt-4o ' } },
        { stage: 'scene-content', value: 'openai:gpt-5' },
      ],
    );
    expect(routing.defaultModel).toBe('openai:gpt-4o');
    expect(routing.routes).toEqual({ 'scene-content': 'openai:gpt-5' });
  });
});
