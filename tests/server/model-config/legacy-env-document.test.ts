/**
 * The document slot of a deployment configured only through the provider store (no
 * openmaic.yml): the real translation and slot lookup, end to end. Upstream runs this over the
 * legacy PDF_* variables; KHAITAM does not read them, so the providers come from a snapshot.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearProviders, useProviders } from '../../fixtures/provider-snapshot';

const ENV = ['OPENMAIC_CONFIG', 'DEFAULT_MODEL', 'MODEL_ROUTES', 'MODEL_FALLBACK'];

let dir: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaic-legacy-document-'));
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  for (const name of ENV) vi.stubEnv(name, '');
  clearProviders();
});

afterEach(() => {
  clearProviders();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function documentServices() {
  const { resolveExtractionServices } = await import('@/lib/server/material-extraction/services');
  return resolveExtractionServices();
}

describe('document slot from the saved providers', () => {
  it('resolves to self-hosted MinerU from its key and base URL', async () => {
    useProviders({ pdf: { mineru: { apiKey: 'env-key', baseUrl: 'https://mineru.example' } } });
    const services = await documentServices();
    // A saved provider is the deployment's own configuration, not a translated legacy default.
    expect(services.documentStatus).toBe('configured');
    expect(services.document).toMatchObject({
      providerId: 'mineru',
      apiKey: 'env-key',
      baseUrl: 'https://mineru.example',
      managed: true,
      origin: 'configuration',
    });
  });

  it('resolves to MinerU Cloud from its key alone, ahead of self-hosted MinerU', async () => {
    useProviders({
      pdf: {
        mineru: { apiKey: '', baseUrl: 'https://mineru.example' },
        'mineru-cloud': { apiKey: 'cloud-key' },
      },
    });
    const services = await documentServices();
    expect(services.document).toMatchObject({ providerId: 'mineru-cloud', apiKey: 'cloud-key' });
  });

  it('prefers MinerU over an unpdf entry listed before it', async () => {
    useProviders({
      pdf: {
        unpdf: { apiKey: '', baseUrl: 'http://unpdf.example' },
        mineru: { apiKey: '', baseUrl: 'https://mineru.example' },
      },
    });
    expect((await documentServices()).document).toMatchObject({ providerId: 'mineru' });
  });

  it('lets openmaic.yml win over the saved providers', async () => {
    useProviders({ pdf: { 'mineru-cloud': { apiKey: 'cloud-key' } } });
    fs.writeFileSync(
      path.join(dir, 'openmaic.yml'),
      [
        'providers:',
        '  mineru:',
        '    preset: mineru',
        '    baseUrl: https://mineru.yml.example',
        'slots:',
        '  document: mineru',
        '',
      ].join('\n'),
    );
    const services = await documentServices();
    expect(services.documentStatus).toBe('configured');
    expect(services.document).toMatchObject({
      providerId: 'mineru',
      baseUrl: 'https://mineru.yml.example',
      origin: 'configuration',
    });
    expect(services.document?.apiKey).toBeUndefined();
  });
});
