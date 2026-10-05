import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Value } from 'typebox/value';
import type { CourseDocument, CourseStore } from '@/lib/server/agent-runtime/course-tools';
import { buildGenerationTools } from '@/lib/server/agent-runtime/generation-tools';
import { widgetRegistry, walkthroughProvider } from '@/lib/widgets';
import type { Scene } from '@/lib/types/stage';

const throwingAi = vi.fn(async () => {
  throw new Error('LLM must not be called');
});

function walkthroughScene(id = 'scene-w', order = 1): Scene {
  const wid = widgetRegistry.walkthroughIds()[0]!;
  const content = walkthroughProvider.build({ id: wid }, { locale: 'en-US' }).content;
  return {
    id,
    stageId: 'stage-test',
    order,
    title: 'Walk',
    type: 'interactive',
    content,
    actions: [{ id: 'old', type: 'speech', text: 'old narration' }],
  } as unknown as Scene;
}

function codeScene(): Scene {
  return {
    id: 'scene-c',
    stageId: 'stage-test',
    order: 1,
    title: 'Code',
    type: 'interactive',
    content: { type: 'interactive', html: '<body></body>', widgetType: 'code' },
    actions: [],
  } as unknown as Scene;
}

function setup(scenes: Scene[]) {
  let doc = {
    stage: { id: 'stage-test', name: 'T', createdAt: 1, updatedAt: 1 },
    scenes: structuredClone(scenes),
    outline: { outlines: [], createdAt: 1, updatedAt: 1 },
  } as unknown as CourseDocument;
  const store = {
    loadDocument: vi.fn(async () => doc),
    putScene: vi.fn(async (_id: string, scene: Scene) => {
      doc = { ...doc, scenes: doc.scenes.map((s) => (s.id === scene.id ? scene : s)) };
    }),
    saveDocument: vi.fn(async (next: CourseDocument) => {
      doc = structuredClone(next);
    }),
  } as unknown as CourseStore;
  const tools = buildGenerationTools({
    store,
    stageAccess: async () => ({ kind: 'owned' as const }),
    sessionId: 's',
    onCheckpoint: vi.fn(),
    aiCall: throwingAi,
    generateActions: throwingAi as never,
    synthesizeTts: vi.fn(async () => ({
      available: true,
      changed: false,
      generated: 0,
      skipped: 0,
      failed: [],
    })),
  } as never) as AgentTool<never, never>[];
  const tool = (name: string) => tools.find((t) => t.name === name)!;
  return { store, get: () => doc, tool };
}

afterEach(() => {
  vi.unstubAllEnvs();
  throwingAi.mockClear();
});

describe('generate_scene policy', () => {
  it('drops "code" from the widgetType union unless allowed (read at build time)', () => {
    const accepts = (type: string) =>
      Value.Check(setup([]).tool('generate_scene').parameters as never, {
        stageId: 's',
        order: 1,
        title: 't',
        type: 'interactive',
        widgetType: type,
        brief: 'b',
      });
    expect(accepts('diagram')).toBe(true);
    expect(accepts('code')).toBe(false);
    vi.stubEnv('OPENMAIC_ALLOW_CODE_WIDGET', 'true');
    expect(accepts('code')).toBe(true);
  });

  it('returns code-widget-blocked and writes nothing when the final scene is a code widget', async () => {
    const t = setup([]);
    const aiCall = vi.fn(async (_s: string, _u: string) => '<html><body>x</body></html>');
    const tools = buildGenerationTools({
      store: t.store,
      stageAccess: async () => ({ kind: 'owned' as const }),
      onCheckpoint: vi.fn(),
      aiCall,
      generateActions: vi.fn(async () => []) as never,
    } as never) as AgentTool<never, never>[];
    const res = await tools
      .find((x) => x.name === 'generate_scene')!
      .execute('c', {
        stageId: 'stage-test',
        order: 1,
        title: 'T',
        type: 'interactive',
        widgetType: 'code',
        brief: 'b',
      } as never);
    expect(res).toMatchObject({ isError: true, details: { error: 'code-widget-blocked' } });
    expect(t.store.putScene).not.toHaveBeenCalled();
  });

  it('rejects widgetOutline.walkthroughId with validIds, without calling the LLM', async () => {
    const t = setup([]);
    const res = await t.tool('generate_scene').execute('c', {
      stageId: 'stage-test',
      order: 1,
      title: 'T',
      type: 'interactive',
      brief: 'b',
      widgetOutline: { walkthroughId: 'bfs' },
    } as never);
    expect(res).toMatchObject({
      isError: true,
      details: { error: 'use-generate-walkthrough', validIds: widgetRegistry.walkthroughIds() },
    });
    expect(throwingAi).not.toHaveBeenCalled();
    expect(t.store.putScene).not.toHaveBeenCalled();
  });
});

describe('generate_actions on a walkthrough scene', () => {
  it('rebuilds actions from the provider without calling the LLM', async () => {
    const t = setup([walkthroughScene()]);
    const res = await t.tool('generate_actions').execute('c', {
      stageId: 'stage-test',
      sceneId: 'scene-w',
      synthesizeAudio: false,
    } as never);
    expect(res).not.toMatchObject({ isError: true });
    expect(throwingAi).not.toHaveBeenCalled();
    const expected = walkthroughProvider.actions(walkthroughScene() as never, { locale: 'en-US' });
    expect(t.get().scenes[0]!.actions).toEqual(expected);
  });

  it('returns walkthrough-stale and does not write when the catalog moved', async () => {
    const scene = walkthroughScene();
    (scene.content as unknown as { widgetConfig: { entryRev: number } }).widgetConfig.entryRev += 1;
    const t = setup([scene]);
    const res = await t.tool('generate_actions').execute('c', {
      stageId: 'stage-test',
      sceneId: 'scene-w',
    } as never);
    expect(res).toMatchObject({ isError: true, details: { error: 'walkthrough-stale' } });
    expect(t.store.putScene).not.toHaveBeenCalled();
    expect(throwingAi).not.toHaveBeenCalled();
  });
});

describe('duplicate_scene policy', () => {
  it('blocks a code source, allows it when the flag is on', async () => {
    const t = setup([codeScene()]);
    const args = { stageId: 'stage-test', templateOrder: 1, targetOrder: 2 } as never;
    expect(await t.tool('duplicate_scene').execute('c1', args)).toMatchObject({
      isError: true,
      details: { error: 'code-widget-blocked' },
    });
    expect(t.store.saveDocument).not.toHaveBeenCalled();
    vi.stubEnv('OPENMAIC_ALLOW_CODE_WIDGET', 'true');
    const ok = setup([codeScene()]);
    expect(await ok.tool('duplicate_scene').execute('c2', args)).not.toMatchObject({
      isError: true,
    });
  });

  it('copies a walkthrough and rebuilds its actions from the provider when current', async () => {
    const t = setup([walkthroughScene()]);
    await t.tool('duplicate_scene').execute('c', {
      stageId: 'stage-test',
      templateOrder: 1,
      targetOrder: 2,
    } as never);
    const copy = t.get().scenes.find((s) => s.order === 2)!;
    expect(copy.content).toEqual(walkthroughScene().content);
    expect(copy.actions).toEqual(
      walkthroughProvider.actions(walkthroughScene() as never, { locale: 'en-US' }),
    );
  });

  it('copies the old actions verbatim when the walkthrough is stale', async () => {
    const scene = walkthroughScene();
    (scene.content as unknown as { widgetConfig: { entryRev: number } }).widgetConfig.entryRev += 1;
    const t = setup([scene]);
    await t.tool('duplicate_scene').execute('c', {
      stageId: 'stage-test',
      templateOrder: 1,
      targetOrder: 2,
    } as never);
    const copy = t.get().scenes.find((s) => s.order === 2)!;
    expect(copy.content).toEqual(scene.content);
    expect(copy.actions).toEqual(scene.actions);
  });
});
