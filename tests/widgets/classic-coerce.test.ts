import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SceneOutline } from '@/lib/types/generation';
import { coerceCodeOutline } from '@/app/api/generate/scene-outlines-stream/coerce-code-outline';

const generateSceneContent = vi.hoisted(() => vi.fn());
const streamLLM = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: vi.fn(async () => ({
    model: {},
    modelInfo: {},
    modelString: 'test:model',
    thinkingConfig: undefined,
  })),
}));
vi.mock('@/lib/ai/llm', () => ({ callLLM: vi.fn(), streamLLM }));
vi.mock('@openmaic/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@openmaic/generation')>()),
  generateSceneContent,
}));

const KEY = 'OPENMAIC_ALLOW_CODE_WIDGET';
let original: string | undefined;

beforeEach(() => {
  original = process.env[KEY];
  delete process.env[KEY];
  generateSceneContent.mockReset().mockResolvedValue({ html: '<p>x</p>' });
  streamLLM.mockReset();
});

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

const base = {
  id: 's1',
  type: 'interactive' as const,
  title: 'Sorting',
  description: 'd',
  keyPoints: ['k'],
  order: 1,
};

const codeOutline: SceneOutline = {
  ...base,
  widgetType: 'code',
  widgetOutline: { concept: 'Bubble sort', language: 'python', challengeType: 'implement' },
};

const legacy = (conceptName: string, subject?: string): SceneOutline => ({
  ...base,
  interactiveConfig: { conceptName, conceptOverview: 'o', designIdea: 'd', subject },
});

describe('coerceCodeOutline', () => {
  it('turns code into simulation and drops code-only fields', () => {
    expect(coerceCodeOutline(codeOutline)).toEqual({
      ...base,
      widgetType: 'simulation',
      widgetOutline: { concept: 'Bubble sort' },
    });
  });

  it('coerces widgetOutline.widgetType as well', () => {
    const out = {
      ...base,
      widgetType: 'diagram',
      widgetOutline: { concept: 'c', widgetType: 'code' },
    } as unknown as SceneOutline;
    expect(coerceCodeOutline(out)).toEqual({
      ...base,
      widgetType: 'diagram',
      widgetOutline: { concept: 'c', widgetType: 'simulation' },
    });
  });

  it('keeps other widget types and non-widget outlines untouched', () => {
    for (const widgetType of ['simulation', 'diagram', 'game', 'visualization3d'] as const) {
      const o: SceneOutline = { ...base, widgetType, widgetOutline: { concept: 'c' } };
      expect(coerceCodeOutline(o)).toBe(o);
    }
    const slide: SceneOutline = { ...base, type: 'slide' };
    expect(coerceCodeOutline(slide)).toBe(slide);
  });

  it('falls back to the title when a code outline has no concept', () => {
    const out = coerceCodeOutline({ ...base, widgetType: 'code' });
    expect(out).toMatchObject({ widgetType: 'simulation', widgetOutline: { concept: 'Sorting' } });
  });

  it('coerces a legacy interactiveConfig that would be inferred as code', () => {
    const out = coerceCodeOutline(legacy('Sorting algorithm', 'programming'));
    expect(out).toMatchObject({
      widgetType: 'simulation',
      widgetOutline: { concept: 'Sorting algorithm' },
    });
  });

  it('leaves a legacy interactiveConfig alone when it is not inferred as code', () => {
    const physics = legacy('Pendulum code', 'physics'); // simulation rule wins over code rule
    const flow = legacy('Build workflow', 'ops');
    expect(coerceCodeOutline(physics)).toBe(physics);
    expect(coerceCodeOutline(flow)).toBe(flow);
  });

  it('keeps code when the flag is on', () => {
    process.env[KEY] = 'true';
    const l = legacy('Sorting algorithm', 'programming');
    expect(coerceCodeOutline(codeOutline)).toBe(codeOutline);
    expect(coerceCodeOutline(l)).toBe(l);
  });

  it('never returns null', () => {
    for (const o of [codeOutline, legacy('a'), { ...base, type: 'slide' as const }]) {
      expect(coerceCodeOutline(o)).not.toBeNull();
    }
  });
});

describe('POST /api/generate/scene-content', () => {
  const post = async (outline: SceneOutline) => {
    const { POST } = await import('@/app/api/generate/scene-content/route');
    return POST(
      new NextRequest('http://localhost/api/generate/scene-content', {
        method: 'POST',
        body: JSON.stringify({
          outline,
          allOutlines: [outline],
          stageId: 'stage-1',
          stageInfo: { name: 'n' },
        }),
      }),
    );
  };

  it('coerces a client-sent code outline before generating', async () => {
    const res = await post(codeOutline);
    expect(res.status).toBe(200);
    expect(generateSceneContent.mock.calls[0][0]).toMatchObject({ widgetType: 'simulation' });
  });

  it('passes code through when the flag is on', async () => {
    process.env[KEY] = 'true';
    await post(codeOutline);
    expect(generateSceneContent.mock.calls[0][0]).toMatchObject({ widgetType: 'code' });
  });
});

describe('POST /api/generate/scene-outlines-stream', () => {
  async function streamedOutlines(): Promise<SceneOutline[]> {
    const json = JSON.stringify({
      languageDirective: 'en',
      outlines: [codeOutline, { ...codeOutline, id: 's2', widgetType: 'game' }],
    });
    streamLLM.mockReturnValue({
      textStream: (async function* () {
        yield json;
      })(),
    });
    const { POST } = await import('@/app/api/generate/scene-outlines-stream/route');
    const res = await POST(
      new NextRequest('http://localhost/api/generate/scene-outlines-stream', {
        method: 'POST',
        body: JSON.stringify({ requirements: { requirement: 'sorting', language: 'en-US' } }),
      }),
    );
    const sse = await res.text();
    return sse
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)))
      .filter((event) => event.type === 'outline')
      .map((event) => event.data);
  }

  it('coerces code outlines in the stream and keeps the rest', async () => {
    const outlines = await streamedOutlines();
    expect(outlines.map((o) => o.widgetType)).toEqual(['simulation', 'game']);
  });

  it('keeps code in the stream when the flag is on', async () => {
    process.env[KEY] = 'true';
    const outlines = await streamedOutlines();
    expect(outlines.map((o) => o.widgetType)).toEqual(['code', 'game']);
  });
});
