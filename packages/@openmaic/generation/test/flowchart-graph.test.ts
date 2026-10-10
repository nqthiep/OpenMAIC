import { describe, expect, test } from 'vitest';

import { parseFlowchartResponse } from '../src/diagram/flowchart-response';
import type { AICallFn } from '../src/pipeline-types';
import { generateWidgetContent } from '../src/scene-generator';
import type { SceneOutline } from '../src/outline-types';

const outline = (diagramType: string = 'flowchart'): SceneOutline =>
  ({
    id: 'flow',
    type: 'interactive',
    title: 'Order fulfilment',
    description: 'How an order moves from receipt to delivery.',
    keyPoints: ['Check stock', 'Pick and pack', 'Ship'],
    order: 1,
    widgetType: 'diagram',
    widgetOutline: { diagramType, nodeCount: 7 },
  }) as SceneOutline;

const graphJson = JSON.stringify({
  direction: 'TB',
  labels: { prev: 'Quay lại', next: 'Tiếp' },
  nodes: [
    { id: 'a', label: 'Receive order', type: 'start' },
    { id: 'b', label: 'Ship it', type: 'end', focal: true },
  ],
  edges: [{ from: 'a', to: 'b', label: 'then' }],
});

const htmlDoc =
  '<!DOCTYPE html><html><body>FROM-HTML-PROMPT<script type="application/json" id="widget-config">{"nodes":[],"edges":[],"revealOrder":[]}</script></body></html>';

function recordingAI(responses: string[]) {
  const calls: Array<{ system: string; user: string }> = [];
  const aiCall: AICallFn = async (system, user) => {
    calls.push({ system, user });
    return responses[Math.min(calls.length - 1, responses.length - 1)];
  };
  return { aiCall, calls };
}

describe('parseFlowchartResponse', () => {
  test('accepts a fenced object with prose around it and keeps labels and direction', () => {
    const parsed = parseFlowchartResponse(`Here you go:\n\`\`\`json\n${graphJson}\n\`\`\`\nDone.`);
    expect(parsed?.graph.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(parsed?.graph.nodes[1]).toMatchObject({ type: 'end', focal: true });
    expect(parsed?.graph.edges).toEqual([{ from: 'a', to: 'b', label: 'then' }]);
    expect(parsed?.labels).toEqual({ prev: 'Quay lại', next: 'Tiếp' });
    expect(parsed?.direction).toBe('TB');
  });

  test('drops unknown node types and invalid directions instead of failing', () => {
    const parsed = parseFlowchartResponse(
      JSON.stringify({
        direction: 'diagonal',
        nodes: [{ id: 'a', label: 'A', type: 'decision' }],
        edges: [],
      }),
    );
    expect(parsed?.graph.nodes[0]).toEqual({ id: 'a', label: 'A' });
    expect(parsed?.direction).toBeUndefined();
  });

  test('returns null when nodes or edges are missing or malformed', () => {
    expect(parseFlowchartResponse('{"nodes":[{"id":"a","label":"A"}]}')).toBeNull();
    expect(parseFlowchartResponse('{"nodes":[{"label":"no id"}],"edges":[]}')).toBeNull();
    expect(parseFlowchartResponse('not json at all')).toBeNull();
  });
});

describe('generateWidgetContent: flowchart as data', () => {
  test('graph mode asks once for the graph and draws it with the platform renderer', async () => {
    const { aiCall, calls } = recordingAI([graphJson]);
    const result = await generateWidgetContent(outline(), aiCall, undefined, {
      diagramOutput: 'graph',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].system).toContain('Flowchart Graph Generator');
    expect(result?.html).toContain('<!DOCTYPE html>');
    expect(result?.html).toContain('Quay lại');
    expect(result?.html).toContain('id="node-a"');
    expect(result?.widgetConfig).toMatchObject({ type: 'diagram' });
  });

  test('falls back to the HTML prompt when the graph response is not valid JSON', async () => {
    const { aiCall, calls } = recordingAI(['sorry, no json here', htmlDoc]);
    const result = await generateWidgetContent(outline(), aiCall, undefined, {
      diagramOutput: 'graph',
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].system).toContain('Interactive Diagram Generator');
    expect(result?.html).toContain('FROM-HTML-PROMPT');
  });

  test('falls back when the graph refers to a node id that does not exist', async () => {
    const broken = JSON.stringify({
      nodes: [{ id: 'a', label: 'A' }],
      edges: [{ from: 'a', to: 'missing' }],
    });
    const { aiCall, calls } = recordingAI([broken, htmlDoc]);
    const result = await generateWidgetContent(outline(), aiCall, undefined, {
      diagramOutput: 'graph',
    });

    expect(calls).toHaveLength(2);
    expect(result?.html).toContain('FROM-HTML-PROMPT');
  });

  test('the default keeps the HTML prompt, one call, unchanged', async () => {
    const { aiCall, calls } = recordingAI([htmlDoc]);
    const result = await generateWidgetContent(outline(), aiCall);

    expect(calls).toHaveLength(1);
    expect(calls[0].system).toContain('Interactive Diagram Generator');
    expect(result?.html).toContain('FROM-HTML-PROMPT');
  });

  test('graph mode only applies to flowcharts; other diagram types keep the HTML prompt', async () => {
    const { aiCall, calls } = recordingAI([htmlDoc]);
    await generateWidgetContent(outline('hierarchy'), aiCall, undefined, {
      diagramOutput: 'graph',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].system).toContain('Interactive Diagram Generator');
  });
});
