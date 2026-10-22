import { describe, expect, it } from 'vitest';

import { PROVIDERS } from '@/lib/ai/providers';
import { isKeylessProvider } from '@/lib/server/provider-store/build-config';
import { catalogFor, knownProviderIds } from '@/lib/server/provider-store/catalog';

describe('omniroute catalog entry', () => {
  it('registers OmniRoute as an OpenAI-compatible built-in provider', () => {
    const provider = PROVIDERS.omniroute;
    expect(provider).toMatchObject({
      id: 'omniroute',
      name: 'OmniRoute',
      type: 'openai',
      defaultBaseUrl: 'http://omniroute:20129/v1',
      requiresApiKey: true,
    });
    expect(provider.icon).toBeUndefined();
    expect(provider.models).toEqual([]);
  });

  it('is a known provider of the providers section', () => {
    expect(knownProviderIds('providers')).toContain('omniroute');
  });

  it('needs an API key and is not keyless', () => {
    const entry = catalogFor('providers').find((candidate) => candidate.id === 'omniroute');
    expect(entry).toBeDefined();
    expect(entry?.requiresApiKey).toBe(true);
    expect(entry?.keyless).toBe(false);
    expect(isKeylessProvider('providers', 'omniroute')).toBe(false);
  });

  it('defaults to the self-hosted gateway base URL', () => {
    const entry = catalogFor('providers').find((candidate) => candidate.id === 'omniroute');
    expect(entry?.defaultBaseUrl).toBe('http://omniroute:20129/v1');
  });

  it('lists no pinned models; the gateway serves them dynamically', () => {
    const entry = catalogFor('providers').find((candidate) => candidate.id === 'omniroute');
    expect(entry?.name).toBe('OmniRoute');
    expect(entry?.models).toEqual([]);
  });
});
