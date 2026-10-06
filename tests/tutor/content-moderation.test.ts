import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentTool } from '@earendil-works/pi-agent-core';

import { extractVisibleText, moderateScene } from '@/lib/server/agent-runtime/content-moderation';
import type { CourseDocument, CourseStore } from '@/lib/server/agent-runtime/course-tools';
import { buildDslCourseTools } from '@/lib/server/agent-runtime/dsl-tools';
import { buildGenerationTools } from '@/lib/server/agent-runtime/generation-tools';
import type { Scene } from '@/lib/types/stage';

const fakeModerate = vi.hoisted(() => vi.fn());
vi.mock('@/lib/tutor/moderation', async (orig) => ({
  ...(await orig<typeof import('@/lib/tutor/moderation')>()),
  moderate: fakeModerate,
}));

const ALLOW = { allow: true, categories: [], model: 'm' } as const;
const BLOCK = { allow: false, categories: ['violence'], model: 'm' } as const;

function slideScene(text = 'Hello', extra: Record<string, unknown>[] = []): Scene {
  return {
    id: 'scene_s1',
    stageId: 'stage-test',
    order: 1,
    title: 'Title',
    type: 'slide',
    content: {
      type: 'slide',
      canvas: {
        id: 'c',
        viewportSize: 1000,
        viewportRatio: 0.5625,
        theme: { backgroundColor: '#fff', themeColors: [], fontColor: '#111', fontName: 'Inter' },
        elements: [
          {
            id: 't',
            type: 'text',
            left: 0,
            top: 0,
            width: 1,
            height: 1,
            rotate: 0,
            defaultFontName: 'Inter',
            defaultColor: '#111',
            content: `<p>${text}</p>`,
          },
          ...extra,
        ],
      },
    },
    actions: [{ id: 'a1', type: 'speech', text: 'Spoken line' }],
  } as unknown as Scene;
}

const quiz = {
  id: 'q',
  stageId: 'stage-test',
  order: 1,
  title: 'Quiz',
  type: 'quiz',
  content: {
    type: 'quiz',
    questions: [
      {
        id: 'q1',
        type: 'single',
        question: 'Which?',
        options: [
          { label: 'Alpha', value: 'A' },
          { label: 'Beta', value: 'B' },
        ],
        answer: ['A'],
        analysis: 'Because Alpha.',
      },
    ],
  },
  actions: [],
} as unknown as Scene;

describe('extractVisibleText', () => {
  it('collects slide text, table cells, shape text and speech; skips other element kinds', () => {
    const scene = slideScene('Hello', [
      { id: 'sh', type: 'shape', text: { content: '<p>Shape words</p>' } },
      { id: 'tb', type: 'table', data: [[{ text: 'A1' }, { text: 'B1' }]] },
      { id: 'lx', type: 'latex', latex: 'x^2' },
      { id: 'im', type: 'image', src: 'https://x/y.png' },
    ]);
    const text = extractVisibleText(scene);
    expect(text).toEqual(['Title', 'Hello', 'Shape words', 'A1 | B1', 'Spoken line']);
  });

  it('collects quiz question, options and explanation', () => {
    expect(extractVisibleText(quiz)).toEqual(['Quiz', 'Which?', 'Alpha', 'Beta', 'Because Alpha.']);
  });

  it('skips interactive html (also for walkthroughs) but still moderates title and speech', () => {
    const widget = {
      id: 'w',
      order: 1,
      title: 'W',
      type: 'interactive',
      content: { type: 'interactive', html: '<body>Secret html</body>', widgetConfig: {} },
      actions: [],
    } as unknown as Scene;
    expect(extractVisibleText(widget)).toEqual(['W']);
    const walk = {
      ...widget,
      content: { ...widget.content, widgetConfig: { kind: 'walkthrough' } },
      actions: [{ id: 'a', type: 'speech', text: 'Trusted' }],
    } as unknown as Scene;
    expect(extractVisibleText(walk)).toEqual(['W', 'Trusted']);
  });
});

describe('moderateScene', () => {
  it('returns null when allowed and checks the out direction', async () => {
    const mod = vi.fn(async () => ALLOW);
    expect(await moderateScene(slideScene(), { moderate: mod, locale: 'en-US' })).toBeNull();
    expect(mod).toHaveBeenCalledTimes(1);
    expect(mod).toHaveBeenCalledWith(
      expect.stringContaining('Spoken line'),
      expect.objectContaining({ direction: 'out', locale: 'en-US' }),
    );
  });

  it('returns content-blocked with categories and hint', async () => {
    const blocked = await moderateScene(slideScene(), { moderate: async () => BLOCK });
    expect(blocked).toEqual({
      error: 'content-blocked',
      categories: ['violence'],
      hint: expect.any(String),
    });
  });

  it('is fail-closed: a no-category block (missing route / failure) and a throwing moderate both block', async () => {
    const noRoute = { allow: false, categories: [], model: '' };
    expect(await moderateScene(slideScene(), { moderate: async () => noRoute })).toMatchObject({
      error: 'content-blocked',
      categories: [],
    });
    const thrower = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await moderateScene(slideScene(), { moderate: thrower })).toMatchObject({
      error: 'content-blocked',
    });
  });

  it('chunks long text to <= 4000 chars and stops at the first block', async () => {
    const long = 'x'.repeat(9_000);
    const seen: number[] = [];
    const mod = vi.fn(async (text: string) => {
      seen.push(text.length);
      return seen.length === 2 ? BLOCK : ALLOW;
    });
    const blocked = await moderateScene(slideScene(long), { moderate: mod });
    expect(blocked?.error).toBe('content-blocked');
    expect(mod).toHaveBeenCalledTimes(2);
    expect(seen.every((n) => n <= 4000)).toBe(true);

    const all = vi.fn(async () => ALLOW);
    await moderateScene(slideScene(long), { moderate: all });
    expect(all.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('makes no call for a scene without visible text', async () => {
    const mod = vi.fn(async () => ALLOW);
    const empty = { ...slideScene(), title: '', actions: [] } as Scene;
    (empty.content as { canvas: { elements: unknown[] } }).canvas.elements = [];
    expect(await moderateScene(empty, { moderate: mod })).toBeNull();
    expect(mod).not.toHaveBeenCalled();
  });
});

function store(scene: Scene) {
  const doc = {
    stage: { id: 'stage-test', name: 'T', createdAt: 1, updatedAt: 1 },
    outline: { outlines: [], createdAt: 1, updatedAt: 1 },
    scenes: [scene],
  } as unknown as CourseDocument;
  const putScene = vi.fn(async () => undefined);
  return {
    putScene,
    store: {
      loadDocument: async () => doc,
      putScene,
      saveDocument: vi.fn(),
    } as unknown as CourseStore,
  };
}

function find(tools: AgentTool<never, never>[], name: string) {
  return tools.find((t) => t.name === name)!;
}

describe('tool wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    fakeModerate.mockReset();
  });

  const patchText = (s: ReturnType<typeof store>) =>
    find(
      buildDslCourseTools({
        store: s.store,
        stageAccess: async () => ({ kind: 'owned' as const }),
        onCheckpoint: () => undefined,
      }),
      'patch_stage',
    ).execute('c', {
      stageId: 'stage-test',
      target: '/scenes/scene_s1',
      intent: 'edit text',
      ops: [{ op: 'set', path: '/actions/0/text', value: 'New line' }],
    } as never);

  it('patch_stage: flag OFF never moderates', async () => {
    const s = store(slideScene());
    const res = await patchText(s);
    expect(res).not.toHaveProperty('isError');
    expect(fakeModerate).not.toHaveBeenCalled();
  });

  it('patch_stage: flag ON blocks changed text and writes nothing', async () => {
    vi.stubEnv('OPENMAIC_TUTOR_MODERATION', '1');
    fakeModerate.mockResolvedValue(BLOCK);
    const s = store(slideScene());
    const res = await patchText(s);
    expect(res).toMatchObject({
      isError: true,
      details: { error: 'content-blocked', categories: ['violence'] },
    });
    expect(s.putScene).not.toHaveBeenCalled();
  });

  it('patch_stage: flag ON allows clean text and skips unchanged text', async () => {
    vi.stubEnv('OPENMAIC_TUTOR_MODERATION', '1');
    fakeModerate.mockResolvedValue(ALLOW);
    const s = store(slideScene());
    expect(await patchText(s)).not.toHaveProperty('isError');
    expect(fakeModerate).toHaveBeenCalledTimes(1);

    fakeModerate.mockReset();
    fakeModerate.mockResolvedValue(BLOCK);
    const t = store(slideScene());
    const res = await find(
      buildDslCourseTools({
        store: t.store,
        stageAccess: async () => ({ kind: 'owned' as const }),
        onCheckpoint: () => undefined,
      }),
      'patch_stage',
    ).execute('c', {
      stageId: 'stage-test',
      target: '/scenes/scene_s1',
      intent: 'recolor',
      ops: [{ op: 'set', path: '/content/canvas/elements/0/defaultColor', value: '#f00' }],
    } as never);
    expect(res).not.toHaveProperty('isError');
    expect(fakeModerate).not.toHaveBeenCalled();
  });

  it('generate_scene: flag ON blocks before write; OFF behaves as before', async () => {
    const run = async (s: ReturnType<typeof store>) => {
      let n = 0;
      const tools = buildGenerationTools({
        store: s.store,
        stageAccess: async () => ({ kind: 'owned' as const }),
        sessionId: 'sess',
        onCheckpoint: vi.fn(),
        aiCall: async () =>
          ++n === 1
            ? JSON.stringify([{ id: 'q1', type: 'short_answer', question: 'Try it?' }])
            : JSON.stringify([{ type: 'text', content: 'Narration' }]),
        synthesizeTts: vi.fn(async () => ({
          available: true,
          changed: false,
          generated: 0,
          skipped: 0,
          failed: [],
        })),
      } as never);
      return find(tools, 'generate_scene').execute('c', {
        stageId: 'stage-test',
        order: 2,
        title: 'Practice',
        type: 'quiz',
        brief: 'Try it',
      } as never);
    };

    const off = store(slideScene());
    expect(await run(off)).not.toHaveProperty('isError');
    expect(off.putScene).toHaveBeenCalledTimes(1);
    expect(fakeModerate).not.toHaveBeenCalled();

    vi.stubEnv('OPENMAIC_TUTOR_MODERATION', '1');
    fakeModerate.mockResolvedValue(BLOCK);
    const on = store(slideScene());
    expect(await run(on)).toMatchObject({
      isError: true,
      details: { error: 'content-blocked', categories: ['violence'] },
    });
    expect(on.putScene).not.toHaveBeenCalled();
  });

  it('generate_actions: flag ON moderates the new LLM speech before writing; OFF does not', async () => {
    const run = (s: ReturnType<typeof store>) =>
      find(
        buildGenerationTools({
          store: s.store,
          stageAccess: async () => ({ kind: 'owned' as const }),
          sessionId: 'sess',
          onCheckpoint: vi.fn(),
          aiCall: async () => '[]',
          generateActions: vi.fn(async () => [
            { id: 'n1', type: 'speech', text: 'Generated narration' },
          ]) as never,
          synthesizeTts: vi.fn(),
        } as never),
        'generate_actions',
      ).execute('c', {
        stageId: 'stage-test',
        sceneId: 'scene_s1',
        synthesizeAudio: false,
      } as never);

    const off = store(slideScene());
    expect(await run(off)).not.toHaveProperty('isError');
    expect(fakeModerate).not.toHaveBeenCalled();

    vi.stubEnv('OPENMAIC_TUTOR_MODERATION', '1');
    fakeModerate.mockResolvedValue(BLOCK);
    const on = store(slideScene());
    expect(await run(on)).toMatchObject({
      isError: true,
      details: { error: 'content-blocked', categories: ['violence'] },
    });
    expect(fakeModerate).toHaveBeenCalledWith(
      expect.stringContaining('Generated narration'),
      expect.objectContaining({ direction: 'out' }),
    );
    expect(on.putScene).not.toHaveBeenCalled();
  });
});
