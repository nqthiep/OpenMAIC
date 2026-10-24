import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimedMaterialExtraction } from '@openmaic/storage';
import type { PgAgentSessionMaterialStore } from '@openmaic/storage/material/pg';

import type { DocumentExtractorProvider } from '@/lib/document';
import { redactProviderErrors, snapshotEventDataForLog } from '@/lib/server/agent-runtime/runner';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import { MODEL_FAILURE_TEXT } from '@/lib/server/error-summary';
import {
  EXTRACTION_FAILURE_TEXT,
  extractClaimedSessionMaterial,
} from '@/lib/server/material-extraction/extract';
import { runNextMaterialExtraction } from '@/lib/server/material-extraction/runner';

const UPSTREAM_TEXT = 'upstream rejected the request with status 401';
const BASE_URL = 'http://localhost:3000';
const REQUEST: GenerateClassroomInput = { requirement: 'Teach fractions.' };

const mocks = vi.hoisted(() => ({
  generateClassroom: vi.fn(),
  markRunning: vi.fn(),
  updateProgress: vi.fn(),
  markSucceeded: vi.fn(),
  markFailed: vi.fn(),
  resolveModel: vi.fn(),
  isProviderKeyRequired: vi.fn(),
}));

vi.mock('@/lib/server/classroom-generation', () => ({
  generateClassroom: mocks.generateClassroom,
}));
vi.mock('@/lib/server/classroom-job-store', () => ({
  markClassroomGenerationJobRunning: mocks.markRunning,
  updateClassroomGenerationJobProgress: mocks.updateProgress,
  markClassroomGenerationJobSucceeded: mocks.markSucceeded,
  markClassroomGenerationJobFailed: mocks.markFailed,
}));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModel: mocks.resolveModel,
}));
vi.mock('@/lib/ai/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/providers')>()),
  isProviderKeyRequired: mocks.isProviderKeyRequired,
}));

describe('classroom job failure text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markRunning.mockResolvedValue(undefined);
    mocks.markFailed.mockResolvedValue(undefined);
  });

  it("stores the fixed text when the operator's key runs the job", async () => {
    mocks.generateClassroom.mockImplementation(async (_input, options) => {
      options.onManagedKey(true);
      throw new Error(UPSTREAM_TEXT);
    });

    await runClassroomGenerationJob('job-managed', REQUEST, BASE_URL, { ownerId: 'owner-1' });

    expect(mocks.markFailed).toHaveBeenCalledWith('job-managed', MODEL_FAILURE_TEXT);
  });

  it("stores the upstream text when a visitor's key runs the job", async () => {
    mocks.generateClassroom.mockImplementation(async (_input, options) => {
      options.onManagedKey(false);
      throw new Error(UPSTREAM_TEXT);
    });

    await runClassroomGenerationJob('job-visitor', REQUEST, BASE_URL, { ownerId: 'owner-1' });

    expect(mocks.markFailed).toHaveBeenCalledWith('job-visitor', UPSTREAM_TEXT);
  });

  it('stores the fixed text when any model in the run uses the operator key', async () => {
    mocks.generateClassroom.mockImplementation(async (_input, options) => {
      options.onManagedKey(false);
      options.onManagedKey(true);
      throw new Error(UPSTREAM_TEXT);
    });

    await runClassroomGenerationJob('job-mixed', REQUEST, BASE_URL, { ownerId: 'owner-1' });

    expect(mocks.markFailed).toHaveBeenCalledWith('job-mixed', MODEL_FAILURE_TEXT);
  });
});

describe('generateClassroom managed-key report', () => {
  it.each([true, false])('reports managedKey=%s before a later failure', async (managedKey) => {
    const { generateClassroom } = await vi.importActual<
      typeof import('@/lib/server/classroom-generation')
    >('@/lib/server/classroom-generation');
    mocks.resolveModel.mockResolvedValue({
      managedKey,
      model: {},
      modelInfo: undefined,
      modelString: 'stub',
      providerId: 'stub',
      apiKey: '',
      thinkingConfig: undefined,
    });
    mocks.isProviderKeyRequired.mockReturnValue(true);
    const onManagedKey = vi.fn();

    await expect(
      generateClassroom(REQUEST, { baseUrl: BASE_URL, ownerId: 'owner-1', onManagedKey }),
    ).rejects.toThrow('No API key configured');
    expect(onManagedKey).toHaveBeenCalledWith(managedKey);
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
