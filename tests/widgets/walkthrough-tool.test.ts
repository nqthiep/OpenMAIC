import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CourseDocument, CourseStore } from '@/lib/server/agent-runtime/course-tools';
import { buildWalkthroughTool } from '@/lib/server/agent-runtime/walkthrough-tools';
import { resolveLocale } from '@/lib/tutor/locale';
import type { Scene } from '@/lib/types/stage';
import { walkthroughProvider, widgetRegistry } from '@/lib/widgets';

const ID = 'binary-search';

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

function setup(scenes: Scene[] = [], languageDirective?: string) {
  let doc: CourseDocument | null = {
    stage: { id: 'stage-test', name: 'Test', createdAt: 1, updatedAt: 1, languageDirective },
    scenes,
  } as unknown as CourseDocument;
  const store = {
    loadDocument: vi.fn(async () => doc),
    putScene: vi.fn(async (_stageId: string, scene: Scene) => {
      const i = doc!.scenes.findIndex((s) => s.id === scene.id);
      doc!.scenes =
        i < 0 ? [...doc!.scenes, scene] : doc!.scenes.map((s, j) => (j === i ? scene : s));
    }),
    saveDocument: vi.fn(),
  } as unknown as CourseStore;
  const aiCall = vi.fn(async () => {
    throw new Error('LLM must not be called');
  });
  const onCheckpoint = vi.fn();
  const deps = {
    store,
    stageAccess: async () => ({ kind: 'owned' as const }),
    sessionId: 'session-a',
    onCheckpoint,
    aiCall,
  };
  return {
    store,
    aiCall,
    onCheckpoint,
    scenes: () => doc!.scenes,
    tool: buildWalkthroughTool(deps),
    clear: () => (doc = null),
  };
}

const base = { stageId: 'stage-test', order: 1, title: 'Chạy tay', walkthroughId: ID } as const;
type Out = { details: Record<string, unknown>; isError?: boolean };
const run = async (t: ReturnType<typeof setup>, callId: string, p: Record<string, unknown>) =>
  (await t.tool.execute(callId, { ...base, ...p } as never, undefined)) as unknown as Out;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('generate_walkthrough', () => {
  it('writes a walkthrough scene without calling an LLM', async () => {
    const t = setup();
    const out = await run(t, 'c1', {});
    expect(out.isError).toBeUndefined();
    expect(out.details).toMatchObject({ order: 1 });
    expect(Array.isArray(out.details.beats)).toBe(true);
    expect(out.details.lessonKit).toBeDefined();
    const [scene] = t.scenes();
    expect(scene.id).toBe(out.details.sceneId);
    expect(scene.type).toBe('interactive');
    expect(scene.actions?.length ?? 0).toBeGreaterThan(0);
    expect(t.aiCall).not.toHaveBeenCalled();
    expect(t.onCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('returns validIds for an unknown walkthroughId', async () => {
    const t = setup();
    const out = await run(t, 'c1', { walkthroughId: 'nope' });
    expect(out.isError).toBe(true);
    expect(out.details).toEqual({
      error: 'invalid-walkthrough-id',
      validIds: widgetRegistry.walkthroughIds(),
    });
    expect(t.scenes()).toHaveLength(0);
  });

  it('returns validPresetIds for an unknown presetId', async () => {
    const t = setup();
    const out = await run(t, 'c1', { presetId: 'nope' });
    const ids = widgetRegistry.findWalkthrough(ID)!.presets.map((p) => p.id);
    expect(out.details).toEqual({ error: 'invalid-preset-id', validPresetIds: ids });
  });

  it('rejects input together with presetId, then input alone', async () => {
    const t = setup();
    const both = await run(t, 'c1', { presetId: 'mid-hit', input: { values: [1] } });
    expect(both.details).toEqual({ error: 'input-and-preset' });
    const alone = await run(t, 'c2', { input: { values: [1] } });
    expect(alone.details).toEqual({ error: 'invalid-input', issues: ['input-not-enabled'] });
    expect(t.scenes()).toHaveLength(0);
  });

  it('checks the walkthrough id before the preset id', async () => {
    const t = setup();
    const out = await run(t, 'c1', { walkthroughId: 'nope', presetId: 'nope', input: 1 });
    expect(out.details.error).toBe('invalid-walkthrough-id');
  });

  it('is idempotent by callId', async () => {
    const t = setup();
    const first = await run(t, 'c1', {});
    const again = await run(t, 'c1', {});
    expect(again.isError).toBeUndefined();
    expect(again.details).toMatchObject({ sceneId: first.details.sceneId, replay: true });
    expect(again.details.beats).toEqual(first.details.beats);
    expect(t.store.putScene).toHaveBeenCalledTimes(1);
    expect(t.scenes()).toHaveLength(1);
  });

  it('gives different callIds different scene ids', async () => {
    const t = setup();
    const a = await run(t, 'c1', { order: 1 });
    const b = await run(t, 'c2', { order: 2 });
    expect(a.details.sceneId).not.toBe(b.details.sceneId);
    expect(t.scenes()).toHaveLength(2);
  });

  it('replaces the page that already holds the order', async () => {
    const t = setup([slide('old', 1), slide('keep', 2)]);
    const out = await run(t, 'c1', { order: 1 });
    expect(out.isError).toBeUndefined();
    const scenes = t.scenes();
    expect(scenes).toHaveLength(2);
    const replaced = scenes.find((s) => s.order === 1)!;
    expect(replaced.type).toBe('interactive');
    expect(replaced.id).toBe('old');
    expect(scenes.find((s) => s.id === 'keep')!.type).toBe('slide');
  });

  it('follows the stage language directive and the locale parameter', async () => {
    const en = setup([], 'Respond in English');
    await run(en, 'c1', {});
    const cfg = (en.scenes()[0].content as unknown as { widgetConfig: { locale: string } })
      .widgetConfig;
    expect(cfg.locale).toBe('en-US');
    const forced = setup([], 'Respond in English');
    await run(forced, 'c1', { locale: 'vi-VN' });
    const cfg2 = (forced.scenes()[0].content as unknown as { widgetConfig: { locale: string } })
      .widgetConfig;
    expect(cfg2.locale).toBe('vi-VN');
  });

  it('returns walkthrough-too-large as a tool error and writes nothing', async () => {
    vi.spyOn(walkthroughProvider, 'build').mockImplementation(() => {
      throw new Error('walkthrough-too-large');
    });
    const t = setup();
    const out = await run(t, 'c1', {});
    expect(out).toMatchObject({ isError: true, details: { error: 'walkthrough-too-large' } });
    expect(t.scenes()).toHaveLength(0);
  });

  it('reports a missing course document as a tool result', async () => {
    const t = setup();
    t.clear();
    const out = await run(t, 'c1', {});
    expect(out.isError).toBe(true);
  });
});

describe('resolveLocale', () => {
  it.each([
    [undefined, 'vi-VN'],
    ['', 'vi-VN'],
    ['  ', 'vi-VN'],
    ['Trả lời bằng tiếng Việt', 'vi-VN'],
    ['Reply in Vietnamese', 'vi-VN'],
    ['Respond in English', 'en-US'],
    ['Use a friendly tone', 'en-US'],
  ])('%j → %s', (input, expected) => {
    expect(resolveLocale(input)).toBe(expected);
  });
});
