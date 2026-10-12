import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fullSave, incrementalSave } = vi.hoisted(() => ({
  fullSave: vi.fn(),
  incrementalSave: vi.fn(),
}));

vi.mock('@/lib/utils/stage-storage', () => ({
  saveStageData: (...args: unknown[]) => fullSave(...args),
  saveStageDataIncremental: (...args: unknown[]) => incrementalSave(...args),
  loadStageData: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/media/stage-realm-presence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/stage-realm-presence')>()),
  markStageRealmDirty: vi.fn(),
  markStageRealmClean: vi.fn(),
}));

import {
  discardPendingStageChanges,
  flushStageSave,
  markStagePersistenceDirty,
  useStageStore,
} from '@/lib/store/stage';
import { markStageRealmClean, markStageRealmDirty } from '@/lib/media/stage-realm-presence';
import type { Stage } from '@/lib/types/stage';

const stage = (id = 'stage-1'): Stage => ({
  id,
  name: id,
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(() => {
  vi.useFakeTimers();
  fullSave.mockReset().mockResolvedValue(undefined);
  incrementalSave.mockReset().mockResolvedValue(undefined);
  vi.mocked(markStageRealmDirty).mockClear();
  vi.mocked(markStageRealmClean).mockClear();
  useStageStore.getState().clearStore();
  useStageStore.setState({ stage: stage(), chats: [] });
});

afterEach(() => {
  useStageStore.getState().clearStore();
  vi.useRealTimers();
});

describe('realm presence marks from the stage store', () => {
  it('marks the realm dirty for the open stage when a change is recorded', () => {
    markStagePersistenceDirty([{ kind: 'stage' }]);

    expect(markStageRealmDirty).toHaveBeenCalledWith('stage-1');
  });

  it('marks the realm clean after the pending changes are saved', async () => {
    markStagePersistenceDirty([{ kind: 'stage' }]);

    await flushStageSave();

    expect(markStageRealmClean).toHaveBeenCalledWith('stage-1');
    const dirtyOrder = vi.mocked(markStageRealmDirty).mock.invocationCallOrder[0]!;
    const cleanOrder = vi.mocked(markStageRealmClean).mock.invocationCallOrder[0]!;
    expect(cleanOrder).toBeGreaterThan(dirtyOrder);
  });

  it('keeps the realm dirty while the save keeps failing', async () => {
    fullSave.mockRejectedValue(new Error('storage unavailable'));
    incrementalSave.mockRejectedValue(new Error('storage unavailable'));
    markStagePersistenceDirty([{ kind: 'stage' }]);

    await flushStageSave().catch(() => undefined);

    expect(markStageRealmClean).not.toHaveBeenCalled();
  });

  it("marks the realm clean when a deleted stage's pending changes are discarded", () => {
    markStagePersistenceDirty([{ kind: 'stage' }]);

    discardPendingStageChanges('stage-1');

    expect(markStageRealmClean).toHaveBeenCalledWith('stage-1');
  });
});
