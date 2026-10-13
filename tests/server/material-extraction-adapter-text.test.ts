// B48: an adapter-level MaterialExtractionError must not carry vendor text. When a
// media extractor adapter throws with a vendor message, the wrapped error keeps
// only our own fixed message; the original error stays as `cause` and decides
// retryability.

import { describe, expect, it, vi } from 'vitest';

import {
  EXTRACTION_FAILURE_TEXT,
  extractClaimedSessionMaterial,
} from '@/lib/server/material-extraction/extract';
import { MaterialExtractionError } from '@/lib/server/material-extraction/errors';
import type { MediaExtractorProvider } from '@/lib/document';

const VENDOR_ECHO = 'VENDOR-ECHO-4c1d';

function vendorProvider(extract: MediaExtractorProvider['extract']): MediaExtractorProvider {
  return {
    id: 'test-media',
    displayName: 'Test media',
    version: '1',
    supportedMimeTypes: ['video/mp4'],
    capabilities: {
      transcript: true,
      keyframes: true,
      synopsis: false,
      ocr: false,
      async: false,
    },
    availability: vi.fn(async () => ({ available: true })),
    extract,
  };
}

function claim() {
  return {
    material: {
      id: 'mat-1',
      sessionId: 'session-1',
      title: 'clip.mp4',
      rawAssetId: 'ast-raw',
    },
  } as unknown as Parameters<typeof extractClaimedSessionMaterial>[0];
}

describe('adapter vendor text in MaterialExtractionError', () => {
  it('wraps an adapter failure with our own message, not the vendor text', async () => {
    const provider = vendorProvider(async () => {
      throw new Error(`vendor 500: bad key ${VENDOR_ECHO}`);
    });

    const failure = await extractClaimedSessionMaterial(claim(), {
      resolveSource: async () => ({ bytes: Buffer.from([1, 2, 3]), mime: 'video/mp4' }),
      mediaProviders: () => [provider],
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MaterialExtractionError);
    const wrapped = failure as MaterialExtractionError;
    expect(wrapped.message).toBe(EXTRACTION_FAILURE_TEXT);
    expect(wrapped.message).not.toContain(VENDOR_ECHO);
    // The original error is still available as the cause for server-side diagnosis.
    expect(wrapped.cause).toBeInstanceOf(Error);
    expect((wrapped.cause as Error).message).toContain(VENDOR_ECHO);
  });

  it('still marks vendor 5xx failures retryable from the original error', async () => {
    const transient = new Error('HTTP status 503 from vendor');
    (transient as { statusCode?: number }).statusCode = 503;
    const provider = vendorProvider(async () => {
      throw transient;
    });

    const failure = await extractClaimedSessionMaterial(claim(), {
      resolveSource: async () => ({ bytes: Buffer.from([1, 2, 3]), mime: 'video/mp4' }),
      mediaProviders: () => [provider],
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MaterialExtractionError);
    expect((failure as MaterialExtractionError).retryable).toBe(true);
    expect((failure as MaterialExtractionError).message).toBe(EXTRACTION_FAILURE_TEXT);
  });
});
