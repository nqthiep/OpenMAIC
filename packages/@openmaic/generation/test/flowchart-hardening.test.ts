import { describe, expect, test } from 'vitest';

import { layoutFlow, renderFlowHtml, type FlowGraph } from '../src/diagram/flowchart';
import { parseFlowchartResponse } from '../src/diagram/flowchart-response';
import type { SceneOutline } from '../src/outline-types';
import type { AICallFn } from '../src/pipeline-types';
import { generateWidgetContent } from '../src/scene-generator';

const simple: FlowGraph = {
  nodes: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  edges: [{ from: 'a', to: 'b' }],
};

const graphJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ ...simple, ...overrides });

const outline = (nodeCount = 7): SceneOutline =>
  ({
    id: 'flow',
    type: 'interactive',
    title: 'Quy trình',
    description: 'Mô tả quy trình.',
    keyPoints: ['Bước một'],
    order: 1,
    widgetType: 'diagram',
    widgetOutline: { diagramType: 'flowchart', nodeCount },
  }) as SceneOutline;

const htmlDoc =
  '<!DOCTYPE html><html><body>FROM-HTML-PROMPT<script type="application/json" id="widget-config">{"nodes":[],"edges":[],"revealOrder":[]}</script></body></html>';

function recording(responses: string[]) {
  const calls: Array<{ system: string; user: string }> = [];
  const aiCall: AICallFn = async (system, user) => {
    calls.push({ system, user });
    return responses[Math.min(calls.length - 1, responses.length - 1)];
  };
  return { aiCall, calls };
}

describe('layout hardening', () => {
  test('rejects a node id that reuses the dummy-vertex namespace', () => {
    expect(() =>
      layoutFlow({
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'dummy:0:1', label: 'X' },
        ],
        edges: [],
      }),
    ).toThrow(/reserved/);
  });

  test('lays out a 20,000-step chain without overflowing the stack', () => {
    const n = 20000;
    const graph: FlowGraph = {
      nodes: Array.from({ length: n }, (_, i) => ({ id: 'n' + i, label: 'Step ' + i })),
      edges: Array.from({ length: n - 1 }, (_, i) => ({ from: 'n' + i, to: 'n' + (i + 1) })),
    };
    const layout = layoutFlow(graph, 'TB');
    expect(layout.nodes).toHaveLength(n);
    expect(layout.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(
      true,
    );
  });

  test('repeated edges between the same pair get distinct DOM ids', () => {
    const html = renderFlowHtml({
      nodes: simple.nodes,
      edges: [
        { from: 'a', to: 'b', label: 'yes' },
        { from: 'a', to: 'b', label: 'also' },
      ],
    });
    expect(html).toContain('id="edge-a-b"');
    expect(html).toContain('id="edge-a-b-2"');
  });

  test('the page reacts only to messages from its parent frame', () => {
    expect(renderFlowHtml(simple)).toContain('event.source !== window.parent');
  });

  test('the document language follows the course', () => {
    expect(renderFlowHtml(simple, { lang: 'vi' })).toContain('<html lang="vi">');
  });
});

describe('response hardening', () => {
  test('keeps a valid language tag and drops a malformed one', () => {
    expect(parseFlowchartResponse(graphJson({ lang: 'vi' }))?.lang).toBe('vi');
    expect(parseFlowchartResponse(graphJson({ lang: 'zh-CN' }))?.lang).toBe('zh-CN');
    expect(parseFlowchartResponse(graphJson({ lang: '<script>' }))?.lang).toBeUndefined();
  });

  test('rejects a graph above the outline node count', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => ({ id: 'n' + i, label: 'N' + i }));
    const json = JSON.stringify({ nodes, edges: [] });
    expect(parseFlowchartResponse(json, { maxNodes: 7 })).toBeNull();
    expect(parseFlowchartResponse(json, { maxNodes: 8 })).not.toBeNull();
  });

  test('rejects a graph above the hard ceiling even without an outline limit', () => {
    const nodes = Array.from({ length: 61 }, (_, i) => ({ id: 'n' + i, label: 'N' + i }));
    expect(parseFlowchartResponse(JSON.stringify({ nodes, edges: [] }))).toBeNull();
  });

  test('clips over-long text and rejects over-long ids', () => {
    const parsed = parseFlowchartResponse(
      JSON.stringify({
        nodes: [{ id: 'a', label: 'x'.repeat(500), details: 'y'.repeat(1000) }],
        edges: [],
      }),
    );
    expect(parsed?.graph.nodes[0].label).toHaveLength(200);
    expect(parsed?.graph.nodes[0].label.endsWith('…')).toBe(true);
    expect(parsed?.graph.nodes[0].details).toHaveLength(800);
    expect(
      parseFlowchartResponse(
        JSON.stringify({ nodes: [{ id: 'x'.repeat(65), label: 'A' }], edges: [] }),
      ),
    ).toBeNull();
  });
});

describe('generation hardening', () => {
  test('the graph page takes its language from the model', async () => {
    const { aiCall } = recording([graphJson({ lang: 'vi' })]);
    const result = await generateWidgetContent(outline(), aiCall, undefined, {
      diagramOutput: 'graph',
    });
    expect(result?.html).toContain('<html lang="vi">');
  });

  test('a graph above the outline node count falls back to the HTML prompt', async () => {
    const nodes = Array.from({ length: 9 }, (_, i) => ({ id: 'n' + i, label: 'N' + i }));
    const { aiCall, calls } = recording([JSON.stringify({ nodes, edges: [] }), htmlDoc]);
    const result = await generateWidgetContent(outline(7), aiCall, undefined, {
      diagramOutput: 'graph',
    });
    expect(calls).toHaveLength(2);
    expect(result?.html).toContain('FROM-HTML-PROMPT');
  });

  test('visual rules are on by default and can be switched off', async () => {
    const on = recording([htmlDoc]);
    await generateWidgetContent(outline(), on.aiCall);
    expect(on.calls[0].system).toContain('Visual Rules');

    const off = recording([htmlDoc]);
    await generateWidgetContent(outline(), off.aiCall, undefined, { diagramVisualRules: false });
    expect(off.calls[0].system).not.toContain('Visual Rules');
    expect(off.calls[0].system).toContain('Interactive Diagram Generator');
  });
});
