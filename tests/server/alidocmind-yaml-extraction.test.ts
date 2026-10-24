import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProviders, useProviders } from '../fixtures/provider-snapshot';

import type { DocumentExtractorInput, DocumentExtractorProvider } from '@/lib/document';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('AliDocMind saved in the provider settings, for classroom materials', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of ['ALIDOCMIND_ACCESS_KEY_ID', 'ALIDOCMIND_ACCESS_KEY_SECRET']) {
      vi.stubEnv(key, '');
    }
    useProviders({ pdf: { alidocmind: { accessKeyId: 'yaml-ak', accessKeySecret: 'yaml-sk' } } });
  });

  afterEach(() => {
    clearProviders();
    vi.unstubAllEnvs();
  });

  it('is advertised as extractable and extraction receives the managed key pair', async () => {
    const { resolveExtractableMimeTypes } =
      await import('@/lib/server/material-extraction/availability');
    const { extractMaterialSource } = await import('@/lib/server/material-extraction/extract');

    const extractable = await resolveExtractableMimeTypes({ mediaProviders: () => [] });
    expect(extractable.has(DOCX)).toBe(true);

    const extract = vi.fn(async (input: DocumentExtractorInput) => ({
      metadata: { mimeType: input.mimeType, providerId: 'alidocmind' },
      blocks: [{ id: 'b1', type: 'text' as const, text: 'Extracted text' }],
      assets: [],
    }));
    const alidocmind = {
      id: 'alidocmind',
      displayName: 'AliDocMind',
      version: '1',
      supportedMimeTypes: [DOCX],
      requiresServiceConfig: true,
      capabilities: {
        text: true,
        images: true,
        tables: true,
        formulas: true,
        layout: true,
        ocr: true,
        async: true,
      },
      extract,
    } as unknown as DocumentExtractorProvider;

    const result = await extractMaterialSource(
      { bytes: Buffer.from('docx'), mime: DOCX, fileName: 'notes.docx' },
      { providers: () => [alidocmind], mediaProviders: () => [] },
    );

    expect(result.text).toBe('Extracted text');
    expect(extract.mock.calls[0][0].config).toMatchObject({
      providerId: 'alidocmind',
      accessKeyId: 'yaml-ak',
      accessKeySecret: 'yaml-sk',
      managed: true,
    });
  });
});
