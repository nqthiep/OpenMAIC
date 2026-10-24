import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimedMaterialExtraction } from '@openmaic/storage';
import type { PgAgentSessionMaterialStore } from '@openmaic/storage/material/pg';

import type { DocumentExtractorProvider } from '@/lib/document';
import { redactProviderErrors, snapshotEventDataForLog } from '@/lib/server/agent-runtime/runner';
import { storedFailureMessage } from '@/lib/server/generation/run/engine';
import { StepRefusal } from '@/lib/server/generation/steps/context';
import { MODEL_FAILURE_TEXT } from '@/lib/server/error-summary';
import {
  EXTRACTION_FAILURE_TEXT,
  extractClaimedSessionMaterial,
} from '@/lib/server/material-extraction/extract';
import { runNextMaterialExtraction } from '@/lib/server/material-extraction/runner';

const UPSTREAM_TEXT = 'upstream rejected the request with status 401';
const mocks = vi.hoisted(() => ({
  accountsEnabled: vi.fn(),
}));

vi.mock('@/lib/server/accounts/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/accounts/runtime')>()),
  accountsEnabled: mocks.accountsEnabled,
}));

describe('generation run failure text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores the fixed text when accounts are on, so the operator's key never shows a provider's words", () => {
    mocks.accountsEnabled.mockReturnValue(true);
    expect(storedFailureMessage(new Error(UPSTREAM_TEXT), UPSTREAM_TEXT)).toBe(MODEL_FAILURE_TEXT);
  });

  it("keeps the step's own refusal text: it is ours and already fixed", () => {
    mocks.accountsEnabled.mockReturnValue(true);
    const refusal = new StepRefusal('missing-api-key', 'No API key configured for image provider');
    expect(storedFailureMessage(refusal, refusal.message)).toBe(refusal.message);
  });

  it('keeps the upstream text when accounts are off (one person running their own keys)', () => {
    mocks.accountsEnabled.mockReturnValue(false);
    expect(storedFailureMessage(new Error(UPSTREAM_TEXT), UPSTREAM_TEXT)).toBe(UPSTREAM_TEXT);
  });
});

describe('material extraction failure text', () => {
  const claim = {
    workerId: 'worker-1',
    material: { id: 'mat_source', sessionId: 'session-1', rawAssetId: 'ast_raw', title: 'notes' },
  } as unknown as ClaimedMaterialExtraction;

  function fakeStore() {
    const settleExtractionFailure = vi.fn(async () => true);
    const store = {
      claimNextExtraction: vi.fn(async () => claim),
      heartbeatExtraction: vi.fn(async () => true),
      settleExtractionFailure,
    } as unknown as PgAgentSessionMaterialStore;
    return { store, settleExtractionFailure };
  }

  it('settles a document extractor failure with the fixed reason', async () => {
    const provider = {
      id: 'doc-test',
      version: '1',
      supportedMimeTypes: ['application/pdf'],
      extract: async () => {
        throw new Error(UPSTREAM_TEXT);
      },
    } as unknown as DocumentExtractorProvider;
    const { store, settleExtractionFailure } = fakeStore();

    await runNextMaterialExtraction(store, 'worker-1', (next) =>
      extractClaimedSessionMaterial(next, {
        resolveSource: async () => ({ bytes: Buffer.from('%PDF-1.4'), mime: 'application/pdf' }),
        mediaProviders: () => [],
        providers: () => [provider],
        configuredProviderIds: () => [],
      }),
    );

    expect(settleExtractionFailure).toHaveBeenCalledWith(
      'mat_source',
      'worker-1',
      EXTRACTION_FAILURE_TEXT,
      false,
    );
  });
});

describe('persisted agent event text', () => {
  const assistantFailure = {
    role: 'assistant',
    stopReason: 'error',
    errorMessage: UPSTREAM_TEXT,
    content: [],
  };
  const turnEnd = () =>
    snapshotEventDataForLog('turn_end', {
      type: 'turn_end',
      message: assistantFailure,
      toolResults: [],
    });

  it("replaces provider error text in persisted events under the operator's key", () => {
    const persisted = [
      turnEnd(),
      snapshotEventDataForLog('agent_end', { type: 'agent_end', messages: [assistantFailure] }),
      snapshotEventDataForLog('message_update', {
        type: 'message_update',
        message: assistantFailure,
        assistantMessageEvent: { type: 'error', reason: 'error', error: assistantFailure },
      }),
    ];

    for (const event of persisted) {
      expect(JSON.stringify(redactProviderErrors(event, true))).not.toContain(UPSTREAM_TEXT);
    }
  });

  it("keeps provider error text in persisted events under a visitor's key", () => {
    const event = turnEnd();

    expect(redactProviderErrors(event, false)).toBe(event);
    expect(JSON.stringify(event)).toContain(UPSTREAM_TEXT);
  });
});
