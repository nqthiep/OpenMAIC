import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { CourseDocument, CourseStore } from '@/lib/server/agent-runtime/course-tools';
import { buildGenerationTools } from '@/lib/server/agent-runtime/generation-tools';

// The agent's generate_scene must read the same diagram switches as the classroom generator.
const ENV_KEYS = ['OPENMAIC_DIAGRAM_OUTPUT', 'OPENMAIC_DIAGRAM_VISUAL_RULES'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const htmlDoc =
  '<!DOCTYPE html><html><body>HTML-PROMPT<script type="application/json" id="widget-config">{"nodes":[],"edges":[],"revealOrder":[]}</script></body></html>';
const graphJson = JSON.stringify({
  lang: 'vi',
  nodes: [
    { id: 'a', label: 'Nhận đơn' },
    { id: 'b', label: 'Giao hàng' },
  ],
  edges: [{ from: 'a', to: 'b' }],
});

async function generateFlowchartPage() {
  const calls: Array<{ system: string; user: string }> = [];
  const aiCall = vi.fn(async (system: string, user: string) => {
    calls.push({ system, user });
    return system.includes('Flowchart Graph Generator') ? graphJson : htmlDoc;
  });

  let doc = {
    stage: { id: 'stage-test', name: 'Quy trình', createdAt: 1, updatedAt: 1 },
    scenes: [],
    outline: { outlines: [], createdAt: 1, updatedAt: 1 },
  } as unknown as CourseDocument;
  const store = {
    loadDocument: vi.fn(async () => doc),
    putScene: vi.fn(async () => undefined),
    saveDocument: vi.fn(async (next: CourseDocument) => {
      doc = structuredClone(next);
    }),
  } as unknown as CourseStore;
  const tools = buildGenerationTools({
    store,
    stageAccess: async () => ({ kind: 'owned' as const }),
    sessionId: 's',
    onCheckpoint: vi.fn(),
    aiCall,
    generateActions: vi.fn(async () => []) as never,
    synthesizeTts: vi.fn(async () => ({
      available: true,
      changed: false,
      generated: 0,
      skipped: 0,
      failed: [],
    })),
  } as never) as AgentTool<never, never>[];
  const generateScene = tools.find((tool) => tool.name === 'generate_scene')!;

  const result = await generateScene.execute(
    'call-1',
    {
      stageId: 'stage-test',
      order: 1,
      title: 'Sơ đồ quy trình',
      type: 'interactive',
      widgetType: 'diagram',
      widgetOutline: { diagramType: 'flowchart', nodeCount: 7 },
      brief: 'Quy trình xử lý đơn hàng từ khi nhận đến khi giao.',
    } as never,
    undefined,
  );
  return { calls, result };
}

describe('agent generate_scene follows the diagram switches', () => {
  it('uses the visual rules and HTML diagrams by default', async () => {
    delete process.env.OPENMAIC_DIAGRAM_OUTPUT;
    delete process.env.OPENMAIC_DIAGRAM_VISUAL_RULES;
    const { calls } = await generateFlowchartPage();
    expect(calls).toHaveLength(1);
    expect(calls[0].system).toContain('Visual Rules');
    expect(calls[0].system).toContain('Interactive Diagram Generator');
  });

  it('drops the visual rules when OPENMAIC_DIAGRAM_VISUAL_RULES is off', async () => {
    delete process.env.OPENMAIC_DIAGRAM_OUTPUT;
    process.env.OPENMAIC_DIAGRAM_VISUAL_RULES = 'off';
    const { calls } = await generateFlowchartPage();
    expect(calls).toHaveLength(1);
    expect(calls[0].system).not.toContain('Visual Rules');
  });

  it('asks for a graph when OPENMAIC_DIAGRAM_OUTPUT is graph', async () => {
    process.env.OPENMAIC_DIAGRAM_OUTPUT = 'graph';
    delete process.env.OPENMAIC_DIAGRAM_VISUAL_RULES;
    const { calls, result } = await generateFlowchartPage();
    expect(calls).toHaveLength(1);
    expect(calls[0].system).toContain('Flowchart Graph Generator');
    // The tool marks a refusal with isError; a successful page carries no such flag.
    expect((result as { isError?: boolean }).isError).toBeFalsy();
  });
});
