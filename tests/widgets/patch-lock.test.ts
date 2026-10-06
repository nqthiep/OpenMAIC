import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { buildDslCourseTools } from '@/lib/server/agent-runtime/dsl-tools';
import type { CourseDocument, CourseStore } from '@/lib/server/agent-runtime/course-tools';
import type { StageAccess } from '@/lib/server/agent-runtime/curriculum-tools';
import type { InteractiveContent, Scene } from '@/lib/types/stage';

const WALK_CONFIG = {
  type: 'simulation',
  kind: 'walkthrough',
  walkthroughId: 'bfs',
  presetId: 'basic',
};

function widgetScene(widgetType: string, widgetConfig: Record<string, unknown>): Scene {
  return {
    id: 'scene_w',
    stageId: 'stage-test',
    order: 1,
    title: 'Widget',
    type: 'interactive',
    content: { type: 'interactive', html: '<body>old</body>', widgetType, widgetConfig },
    actions: [{ id: 'act-1', type: 'speech', text: 'old narration' }],
  } as unknown as Scene;
}

function setup(scene: Scene) {
  let doc = {
    stage: { id: 'stage-test', name: 'T', description: '', createdAt: 1, updatedAt: 1 },
    outline: {
      outlines: [
        {
          id: 'o1',
          order: 1,
          type: scene.type,
          title: scene.title,
          description: '',
          keyPoints: [],
        },
      ],
    },
    scenes: [structuredClone(scene)],
  } as unknown as CourseDocument;
  const putScene = vi.fn(async (_id: string, next: Scene) => {
    doc = { ...doc, scenes: [next] };
  });
  const store = {
    loadDocument: vi.fn(async () => doc),
    putScene,
  } as unknown as CourseStore;
  const owned: StageAccess = { kind: 'owned', stage: { stageId: 'stage-test', name: 'T' } };
  const tools = buildDslCourseTools({
    store,
    stageAccess: async () => owned,
    onCheckpoint: () => undefined,
  }) as AgentTool<never, never>[];
  const patch = tools.find((t) => t.name === 'patch_stage')!;
  return {
    putScene,
    get: () => doc.scenes[0]!,
    run: (ops: unknown[]) =>
      patch.execute('call', {
        stageId: 'stage-test',
        target: '/scenes/1',
        intent: 'x',
        ops,
      } as never),
  };
}

const ENV = 'OPENMAIC_ALLOW_CODE_WIDGET';
let savedEnv: string | undefined;
beforeEach(() => {
  savedEnv = process.env[ENV];
  delete process.env[ENV];
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV];
  else process.env[ENV] = savedEnv;
});

describe('patch_stage walkthrough-locked', () => {
  it.each([
    ['html', { op: 'set', path: '/content/html', value: '<body>new</body>' }],
    ['widgetConfig', { op: 'set', path: '/content/widgetConfig/presetId', value: 'other' }],
    ['widgetConfig removed', { op: 'remove', path: '/content/widgetConfig/kind' }],
  ])('rejects editing %s of a walkthrough scene', async (_name, op) => {
    const t = setup(widgetScene('simulation', WALK_CONFIG));
    const res = await t.run([op]);
    expect(res).toMatchObject({
      isError: true,
      details: {
        error: 'walkthrough-locked',
        hint: 'call generate_walkthrough with another preset',
      },
    });
    expect(t.putScene).not.toHaveBeenCalled();
  });

  it('rejects turning an ordinary scene into a walkthrough by hand', async () => {
    const t = setup(widgetScene('simulation', { type: 'simulation', concept: 'g' }));
    const res = await t.run([
      {
        op: 'set',
        path: '/content/widgetConfig',
        value: { type: 'simulation', kind: 'walkthrough' },
      },
    ]);
    expect(res).toMatchObject({ isError: true, details: { error: 'walkthrough-locked' } });
    expect(t.putScene).not.toHaveBeenCalled();
  });

  it('allows an actions-only edit on a walkthrough scene', async () => {
    const t = setup(widgetScene('simulation', WALK_CONFIG));
    const res = await t.run([{ op: 'set', path: '/actions/0/text', value: 'new narration' }]);
    expect(res).not.toHaveProperty('isError');
    expect(t.get().actions?.[0]).toMatchObject({ text: 'new narration' });
    expect((t.get().content as InteractiveContent).widgetConfig).toMatchObject(WALK_CONFIG);
  });

  it('still allows html edits on a non-walkthrough scene', async () => {
    const t = setup(widgetScene('simulation', { type: 'simulation', concept: 'g' }));
    const res = await t.run([{ op: 'set', path: '/content/html', value: '<body>new</body>' }]);
    expect(res).not.toHaveProperty('isError');
    expect((t.get().content as InteractiveContent).html).toBe('<body>new</body>');
  });
});

describe('patch_stage code-widget-blocked', () => {
  const toCode = [{ op: 'set', path: '/content/widgetType', value: 'code' }];

  it('rejects a result that is a code widget when blocked', async () => {
    const t = setup(widgetScene('simulation', { type: 'simulation', concept: 'g' }));
    const res = await t.run(toCode);
    expect(res).toMatchObject({ isError: true, details: { error: 'code-widget-blocked' } });
    expect(t.putScene).not.toHaveBeenCalled();
  });

  it('also catches code via widgetConfig.type', async () => {
    const t = setup(widgetScene('simulation', { type: 'simulation', concept: 'g' }));
    const res = await t.run([{ op: 'set', path: '/content/widgetConfig/type', value: 'code' }]);
    expect(res).toMatchObject({ isError: true, details: { error: 'code-widget-blocked' } });
  });

  it('allows it when the deployment opts in', async () => {
    process.env[ENV] = 'true';
    const t = setup(widgetScene('simulation', { type: 'simulation', concept: 'g' }));
    const res = await t.run(toCode);
    expect(res).not.toHaveProperty('isError');
    expect(t.putScene).toHaveBeenCalledTimes(1);
  });
});

describe('patch_stage relabelling a blocked code widget', () => {
  const codeByType = () => widgetScene('code', { type: 'simulation', concept: 'g' });
  const codeByConfig = () => widgetScene('simulation', { type: 'code', concept: 'g' });
  const html = { op: 'set', path: '/content/html', value: '<body>fresh</body>' };

  it.each([
    ['widgetType', codeByType, { op: 'set', path: '/content/widgetType', value: 'simulation' }],
    [
      'widgetConfig.type',
      codeByConfig,
      { op: 'set', path: '/content/widgetConfig/type', value: 'simulation' },
    ],
  ])('rejects a %s-only relabel that keeps the old html', async (_name, scene, relabel) => {
    const t = setup(scene());
    const res = await t.run([relabel]);
    expect(res).toMatchObject({
      isError: true,
      details: { error: 'code-widget-blocked', hint: expect.stringContaining('/content/html') },
    });
    expect(t.putScene).not.toHaveBeenCalled();
  });

  it.each([
    ['widgetType', codeByType, { op: 'set', path: '/content/widgetType', value: 'simulation' }],
    [
      'widgetConfig.type',
      codeByConfig,
      { op: 'set', path: '/content/widgetConfig/type', value: 'simulation' },
    ],
  ])('accepts a %s relabel that also replaces /content/html', async (_name, scene, relabel) => {
    const t = setup(scene());
    const res = await t.run([relabel, html]);
    expect(res).not.toHaveProperty('isError');
    expect((t.get().content as InteractiveContent).html).toBe('<body>fresh</body>');
  });

  it('accepts an html-only edit of a non-code widget and leaves other code edits to the policy', async () => {
    const t = setup(widgetScene('simulation', { type: 'simulation', concept: 'g' }));
    expect(await t.run([html])).not.toHaveProperty('isError');
  });
});
