import type { Scene } from '@openmaic/dsl';
import { describe, expect, it } from 'vitest';
import { buildReadSceneTool } from '@/lib/chat/pi/tools/read-scene';
import { buildChildPrompt, buildNativeChildPrompt } from '@/lib/chat/pi/prompts';
import { buildStructuredPrompt } from '@/lib/orchestration/prompt-builder';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import { buildStateContext } from '@/lib/orchestration/summarizers/state-context';
import { binarySearchEntry } from '@/lib/subjects/cp/catalog/binary-search';
import type { StatelessChatRequest } from '@/lib/types/chat';
import { walkthroughProvider, widgetRegistry } from '@/lib/widgets';

type Store = StatelessChatRequest['storeState'];

const walkthrough = walkthroughProvider.build(
  { id: binarySearchEntry.id, presetId: 'absent' },
  { locale: 'vi-VN' },
).content;

const wtScene = {
  id: 'wt1',
  stageId: 'st',
  type: 'interactive',
  title: 'Binary search',
  order: 0,
  content: walkthrough,
} as unknown as Scene;

const htmlScene = {
  id: 'h1',
  stageId: 'st',
  type: 'interactive',
  title: 'Plain widget',
  order: 1,
  content: { type: 'interactive', url: '', html: '<p>hello html</p>' },
} as unknown as Scene;

const store = (scene: Scene, extra: Partial<Store> = {}): Store =>
  ({
    stage: { id: 'st', name: 'Course' },
    scenes: [scene],
    currentSceneId: scene.id,
    mode: 'autonomous',
    whiteboardOpen: false,
    ...extra,
  }) as unknown as Store;

const noLedger: never[] = [];

const teacher = {
  id: 't1',
  name: 'Teacher',
  role: 'teacher',
  persona: 'p',
  allowedActions: [],
} as unknown as AgentConfig;

const ws = (sceneId: string, frame: number) => ({
  sceneId,
  walkthroughId: binarySearchEntry.id,
  preset: 'absent',
  frame,
});

describe('buildStateContext on a walkthrough scene', () => {
  const provider = widgetRegistry.providerForScene(wtScene)!;

  it('uses provider.describe with the runtime state of the same scene', () => {
    const text = buildStateContext(store(wtScene, { widgetState: ws('wt1', 3) }));
    expect(text).toContain(provider.describe(wtScene, { preset: 'absent', frame: 3 }));
    expect(text).not.toContain(provider.describe(wtScene));
  });

  it('falls back to the static digest without widgetState or for another scene id', () => {
    const digest = provider.describe(wtScene);
    expect(buildStateContext(store(wtScene))).toContain(digest);
    expect(buildStateContext(store(wtScene, { widgetState: ws('other', 3) }))).toContain(digest);
  });

  it('leaves unclaimed interactive scenes unchanged', () => {
    const base = buildStateContext(store(htmlScene));
    expect(base).not.toContain('Walkthrough:');
    expect(buildStateContext(store(htmlScene, { widgetState: ws('h1', 3) }))).toBe(base);
  });
});

describe('read_scene on a walkthrough scene', () => {
  it('returns the provider text and no payload-hidden boundary note', async () => {
    const body = {
      storeState: store(wtScene, { widgetState: ws('wt1', 2) }),
    } as StatelessChatRequest;
    const tool = buildReadSceneTool({ body });
    const res = await tool.execute('c1', { sceneId: 'wt1' }, undefined as never);
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain('Walkthrough:');
    expect(text).not.toContain('Content boundary');
  });

  it('keeps the boundary note for other interactive scenes', async () => {
    const body = { storeState: store(htmlScene) } as StatelessChatRequest;
    const res = await buildReadSceneTool({ body }).execute(
      'c1',
      { sceneId: 'h1' },
      undefined as never,
    );
    expect((res.content[0] as { text: string }).text).toContain('Content boundary');
  });
});

describe('tutor coaching prompt block', () => {
  const body = (scene: Scene) =>
    ({
      messages: [],
      storeState: store(scene),
      config: { agentIds: ['t1'], agentConfigs: [teacher] },
      apiKey: '',
    }) as unknown as StatelessChatRequest;

  it('legacy prompt: walkthrough gets ~300 chars and coaching; others are unchanged', () => {
    const wt = buildStructuredPrompt(teacher, store(wtScene));
    expect(wt).toContain('Tutor coaching');
    expect(wt).toContain('around 300 characters');
    const plain = buildStructuredPrompt(teacher, store(htmlScene));
    expect(plain).not.toContain('Tutor coaching');
    expect(plain).toContain('around 100 characters');
  });

  it('pi prompts: walkthrough gets coaching; others are unchanged', () => {
    const wtChild = buildChildPrompt(body(wtScene), teacher, [], noLedger);
    expect(wtChild).toContain('Tutor coaching');
    expect(wtChild).toContain('around 300 characters');
    const wtNative = buildNativeChildPrompt(body(wtScene), teacher, [], [], {
      sceneId: 'wt1',
      sceneType: 'interactive',
    });
    expect(wtNative).toContain('Tutor coaching');

    const plainChild = buildChildPrompt(body(htmlScene), teacher, [], noLedger);
    expect(plainChild).not.toContain('Tutor coaching');
    expect(plainChild).toContain('around 70 Chinese characters');
    const plainNative = buildNativeChildPrompt(body(htmlScene), teacher, [], [], {
      sceneId: 'h1',
      sceneType: 'interactive',
    });
    expect(plainNative).not.toContain('Tutor coaching');
    expect(plainNative).toContain('around 70 Chinese characters');
  });
});
