import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createLogger } from '@/lib/logger';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';

// The classroom generator must read the same diagram switches as the agent runtime.
const callLLMMock = vi.hoisted(() => vi.fn());
const resolveModelMock = vi.hoisted(() => vi.fn());
const ENV_KEYS = ['OPENMAIC_DIAGRAM_OUTPUT', 'OPENMAIC_DIAGRAM_VISUAL_RULES'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

vi.mock('@/lib/ai/llm', () => ({
  callLLM: callLLMMock,
}));

beforeEach(() => {
  callLLMMock.mockReset();
  resolveModelMock.mockReset();
  resolveModelMock.mockResolvedValue({
    model: { provider: 'test.chat', modelId: 'test-model' },
    modelInfo: { outputWindow: 4096, capabilities: {} },
    modelString: 'test:test-model',
    thinkingConfig: undefined,
  });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('scene content step follows the diagram switches', () => {
  test('visual rules are on by default', async () => {
    vi.resetModules();
    delete process.env.OPENMAIC_DIAGRAM_OUTPUT;
    delete process.env.OPENMAIC_DIAGRAM_VISUAL_RULES;
    callLLMMock.mockResolvedValueOnce({ text: htmlDocument() });

    await generate(flowchartOutline());

    expect(callLLMMock.mock.calls[0][0].system).toContain('Visual Rules');
  });

  test('OPENMAIC_DIAGRAM_VISUAL_RULES=off removes the visual rules', async () => {
    vi.resetModules();
    delete process.env.OPENMAIC_DIAGRAM_OUTPUT;
    process.env.OPENMAIC_DIAGRAM_VISUAL_RULES = 'off';
    callLLMMock.mockResolvedValueOnce({ text: htmlDocument() });

    await generate(flowchartOutline());

    expect(callLLMMock.mock.calls[0][0].system).not.toContain('Visual Rules');
  });

  test('OPENMAIC_DIAGRAM_OUTPUT=graph asks for a graph and draws it', async () => {
    vi.resetModules();
    process.env.OPENMAIC_DIAGRAM_OUTPUT = 'graph';
    delete process.env.OPENMAIC_DIAGRAM_VISUAL_RULES;
    callLLMMock.mockResolvedValueOnce({
      text: JSON.stringify({
        lang: 'vi',
        nodes: [
          { id: 'a', label: 'Nhận đơn' },
          { id: 'b', label: 'Giao hàng' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      }),
    });

    const body = await generate(flowchartOutline());

    expect(callLLMMock).toHaveBeenCalledTimes(1);
    expect(callLLMMock.mock.calls[0][0].system).toContain('Flowchart Graph Generator');
    expect(body.content.html).toContain('<html lang="vi">');
  });
});

/** Generate one scene's content as a run does, with the stubbed model. */
async function generate(outline: SceneOutline, requirements?: Partial<UserRequirements>) {
  const { generateSceneContent } = await import('@/lib/server/generation/steps/scene-content');
  const result = await generateSceneContent(
    {
      outline,
      requirements: requirements as UserRequirements | undefined,
      targetLanguage: '',
      model: await resolveModelMock(),
    },
    { log: createLogger('Scene Content'), resolveVisionImages: async (images) => [...images] },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result as { content: any; effectiveOutline: any };
}

function flowchartOutline(): SceneOutline {
  return {
    id: 'scene-flowchart',
    type: 'interactive',
    title: 'Quy trình xử lý đơn hàng',
    description: 'Các bước từ khi nhận đơn đến khi giao hàng.',
    keyPoints: ['Nhận đơn', 'Giao hàng'],
    order: 1,
    widgetType: 'diagram',
    widgetOutline: { diagramType: 'flowchart', nodeCount: 7 },
  };
}

function htmlDocument(): string {
  return `<!DOCTYPE html>
<html>
  <body>
    <script type="application/json" id="widget-config">
      {"type": "diagram", "nodes": [], "edges": [], "revealOrder": []}
    </script>
    <main>diagram widget</main>
  </body>
</html>`;
}
