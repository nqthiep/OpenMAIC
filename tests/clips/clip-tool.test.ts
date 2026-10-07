import { describe, expect, it, vi } from 'vitest';
import { createClipProvider } from '@/lib/clips/provider';
import { createClipRegistry } from '@/lib/clips/registry';
import { buildClipTool } from '@/lib/server/agent-runtime/clip-tools';
import type { CourseDocument, CourseStore } from '@/lib/server/agent-runtime/course-tools';
import type { Scene } from '@/lib/types/stage';
import { fakeAny } from './_fake-clip';

const built = fakeAny();
const unbuilt = fakeAny({ id: 'unbuilt-clip', built: false });
const registry = createClipRegistry([{ id: 'p', clips: [built, unbuilt] }]);
const provider = createClipProvider({ findClip: (id) => registry.findClip(id) });

function slide(id: string, order: number): Scene {
  return {
    id,
    stageId: 'stage-test',
    order,
    title: id,
    type: 'slide',
    content: { type: 'slide', canvas: { id: `c-${id}`, elements: [] } },
    actions: [],
  } as unknown as Scene;
}

function setup(scenes: Scene[] = []) {
  const doc = {
    stage: { id: 'stage-test', name: 'Test', createdAt: 1, updatedAt: 1 },
    scenes,
  } as unknown as CourseDocument;
  const store = {
    loadDocument: vi.fn(async () => doc),
    putScene: vi.fn(async (_id: string, scene: Scene) => {
      const i = doc.scenes.findIndex((s) => s.id === scene.id);
      doc.scenes = i < 0 ? [...doc.scenes, scene] : doc.scenes.map((s, j) => (j === i ? scene : s));
    }),
    saveDocument: vi.fn(),
  } as unknown as CourseStore;
  const aiCall = vi.fn();
  const onCheckpoint = vi.fn();
  const tool = buildClipTool(
    {
      store,
      stageAccess: async () => ({ kind: 'owned' as const }),
      sessionId: 's',
      onCheckpoint,
      aiCall,
    } as never,
    { registry, provider },
  );
  const ordered = () =>
    [...doc.scenes].sort((a, b) => a.order - b.order).map((s) => `${s.order}:${s.id}`);
  return { store, tool, onCheckpoint, aiCall, ordered, scenes: () => doc.scenes };
}

type Out = { details: Record<string, unknown>; isError?: boolean };
const run = async (t: ReturnType<typeof setup>, callId: string, p: Record<string, unknown>) =>
  (await t.tool.execute(
    callId,
    { stageId: 'stage-test', afterOrder: 0, clipId: built.id, ...p } as never,
    undefined,
  )) as unknown as Out;

describe('generate_clip_scenes', () => {
  it('inserts one slide per chapter, no LLM call, one checkpoint each', async () => {
    const t = setup();
    const out = await run(t, 'c1', {});
    expect(out.isError).toBeUndefined();
    expect(out.details.orders).toEqual([1, 2]);
    expect(t.scenes()).toHaveLength(built.chapters.length);
    expect(t.scenes().every((s) => s.type === 'slide' && (s.actions?.length ?? 0) > 0)).toBe(true);
    expect(t.aiCall).not.toHaveBeenCalled();
    expect(t.onCheckpoint).toHaveBeenCalledTimes(2);
  });

  it('inserts after afterOrder and shifts later pages down', async () => {
    const t = setup([slide('a', 1), slide('b', 2), slide('c', 3)]);
    const out = await run(t, 'c1', { afterOrder: 1 });
    expect(out.details.orders).toEqual([2, 3]);
    const ids = out.details.sceneIds as string[];
    expect(t.ordered()).toEqual(['1:a', `2:${ids[0]}`, `3:${ids[1]}`, '4:b', '5:c']);
  });

  it('returns validIds, validPresetIds and the not-prebuilt error', async () => {
    const t = setup();
    expect((await run(t, 'c1', { clipId: 'nope' })).details).toEqual({
      error: 'invalid-clip-id',
      validIds: registry.clipIds(),
    });
    expect((await run(t, 'c2', { presetId: 'zzz' })).details).toEqual({
      error: 'invalid-preset-id',
      validPresetIds: ['p1', 'p2'],
    });
    expect((await run(t, 'c3', { clipId: unbuilt.id })).details).toEqual({
      error: 'clip-not-prebuilt',
    });
    expect(t.scenes()).toHaveLength(0);
  });

  it('rejects a bad afterOrder and a missing stage', async () => {
    const t = setup();
    expect((await run(t, 'c1', { afterOrder: -1 })).details.error).toBe('invalid-order');
    expect((await run(t, 'c2', { afterOrder: 1.5 })).details.error).toBe('invalid-order');
    t.store.loadDocument = vi.fn(async () => null) as never;
    expect((await run(t, 'c3', {})).isError).toBe(true);
  });

  it('is idempotent by callId and distinct across callIds', async () => {
    const t = setup();
    const first = await run(t, 'c1', {});
    const again = await run(t, 'c1', {});
    expect(again.details).toMatchObject({ sceneIds: first.details.sceneIds, replay: true });
    expect(t.scenes()).toHaveLength(2);
    const other = await run(t, 'c2', { afterOrder: 2 });
    expect(other.details.sceneIds).not.toEqual(first.details.sceneIds);
    expect(t.scenes()).toHaveLength(4);
  });
});
