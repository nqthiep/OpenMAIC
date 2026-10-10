import { describe, expect, test } from 'vitest';

import { extractWidgetConfig } from '../src/scene-generator';

import {
  NODE_H,
  NODE_W,
  PALETTE,
  layoutFlow,
  renderFlowHtml,
  textUnits,
  wrapLabel,
  type FlowGraph,
  type FlowLayout,
} from '../src/diagram/flowchart';

const sample: FlowGraph = {
  nodes: [
    { id: 'start', label: 'Receive order', type: 'start' },
    { id: 'check', label: 'Stock available?' },
    { id: 'pick', label: 'Pick items', focal: true },
    { id: 'backorder', label: 'Create backorder' },
    { id: 'pack', label: 'Pack and label' },
    { id: 'ship', label: 'Ship', type: 'end' },
    { id: 'notify', label: 'Notify customer' },
  ],
  edges: [
    { from: 'start', to: 'check' },
    { from: 'check', to: 'pick', label: 'yes' },
    { from: 'check', to: 'backorder', label: 'no' },
    { from: 'backorder', to: 'pick' },
    { from: 'pick', to: 'pack' },
    { from: 'pack', to: 'ship' },
    { from: 'check', to: 'notify' },
    { from: 'notify', to: 'ship' },
  ],
};

type Box = { id: string; left: number; right: number; top: number; bottom: number };

function boxes(layout: FlowLayout): Box[] {
  return layout.nodes.map((n) => ({
    id: n.id,
    left: n.x - NODE_W / 2,
    right: n.x + NODE_W / 2,
    top: n.y - NODE_H / 2,
    bottom: n.y + NODE_H / 2,
  }));
}

describe('layoutFlow', () => {
  test.each(['TB', 'LR'] as const)('%s: nodes stay inside the canvas and do not overlap', (dir) => {
    const layout = layoutFlow(sample, dir);
    const bs = boxes(layout);
    for (const b of bs) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(layout.width);
      expect(b.bottom).toBeLessThanOrEqual(layout.height);
    }
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const [a, b] = [bs[i], bs[j]];
        const apart =
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
  });

  test.each(['TB', 'LR'] as const)(
    '%s: no edge runs through a node, including skipped ranks',
    (dir) => {
      const layout = layoutFlow(sample, dir);
      const bs = boxes(layout);
      for (const e of layout.edges) {
        for (let k = 0; k + 1 < e.points.length; k++) {
          const [p, q] = [e.points[k], e.points[k + 1]];
          for (let t = 0.05; t < 1; t += 0.05) {
            const x = p.x + (q.x - p.x) * t;
            const y = p.y + (q.y - p.y) * t;
            for (const b of bs) {
              const inside = x > b.left + 1 && x < b.right - 1 && y > b.top + 1 && y < b.bottom - 1;
              expect(inside, `${e.from} -> ${e.to} runs through ${b.id}`).toBe(false);
            }
          }
        }
      }
    },
  );

  test('TB: forward edges leave the source bottom and enter the target top', () => {
    const layout = layoutFlow(sample, 'TB');
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const e of layout.edges) {
      const src = byId.get(e.from)!;
      const dst = byId.get(e.to)!;
      expect(dst.y).toBeGreaterThan(src.y);
      expect(e.points[0].y).toBeCloseTo(src.y + NODE_H / 2);
      expect(e.points[e.points.length - 1].y).toBeCloseTo(dst.y - NODE_H / 2);
    }
  });

  test('LR: forward edges run left to right', () => {
    const layout = layoutFlow(sample, 'LR');
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const e of layout.edges) {
      expect(byId.get(e.to)!.x).toBeGreaterThan(byId.get(e.from)!.x);
    }
  });

  test('a cycle lays out without error and the back edge is still drawn from its source', () => {
    const cyclic: FlowGraph = {
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
    };
    const layout = layoutFlow(cyclic, 'TB');
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const back = layout.edges.find((e) => e.from === 'c' && e.to === 'a')!;
    expect(back.points[0].y).toBeCloseTo(byId.get('c')!.y - NODE_H / 2);
    expect(back.points[back.points.length - 1].y).toBeCloseTo(byId.get('a')!.y + NODE_H / 2);
  });

  test('opposite edges between the same pair run on separate lanes', () => {
    const pair: FlowGraph = {
      nodes: [
        { id: 'a', label: 'Validate' },
        { id: 'b', label: 'Retry' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    };
    const layout = layoutFlow(pair, 'TB');
    const [forward, backward] = [layout.edges[0], layout.edges[1]];
    // The horizontal run between the two ranks sits at points[1].y for a direct edge.
    expect(Math.abs(forward.points[1].y - backward.points[1].y)).toBeGreaterThanOrEqual(8);
  });

  // Known ceiling: two long labels on one short segment of a narrow canvas can still collide.
  test('edge labels stay on the canvas and clear of each other in realistic flows', () => {
    // A label on a short edge next to the canvas edge: the case that used to be pushed out of frame.
    const edgeHugging: FlowGraph = {
      nodes: [
        { id: 'receive', label: 'Order received' },
        { id: 'check', label: 'Check stock' },
        { id: 'backorder', label: 'Handle backorder' },
        { id: 'pick', label: 'Pick and pack' },
        { id: 'ship', label: 'Dispatch courier' },
      ],
      edges: [
        { from: 'receive', to: 'check' },
        { from: 'check', to: 'backorder', label: 'out of stock' },
        { from: 'check', to: 'pick', label: 'in stock' },
        { from: 'backorder', to: 'pick', label: 'restocked' },
        { from: 'pick', to: 'ship' },
      ],
    };
    for (const graph of [sample, edgeHugging]) {
      const layout = layoutFlow(graph, 'TB');
      const boxes = layout.edges.flatMap((e) => (e.labelBox ? [e.labelBox] : []));
      expect(boxes.length).toBe(graph.edges.filter((e) => e.label).length);
      for (const b of boxes) {
        const inside =
          b.x >= 0 && b.y >= 0 && b.x + b.w <= layout.width && b.y + b.h <= layout.height;
        expect(inside, `label box ${JSON.stringify(b)} leaves the canvas`).toBe(true);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const [p, q] = [boxes[i], boxes[j]];
          const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
          expect(overlap, `labels ${i} and ${j} overlap`).toBe(false);
        }
      }
    }
  });

  test('edge labels do not cover nodes, including in a loop-heavy process', () => {
    const loops: FlowGraph = {
      nodes: [
        { id: 'receive', label: 'Receive order' },
        { id: 'verify', label: 'Verify stock' },
        { id: 'confirm', label: 'Confirm with customer' },
        { id: 'pack', label: 'Pack and hand over' },
        { id: 'track', label: 'Track delivery' },
        { id: 'exception', label: 'Handle exception' },
        { id: 'done', label: 'Delivered' },
      ],
      edges: [
        { from: 'receive', to: 'verify' },
        { from: 'verify', to: 'confirm', label: 'valid' },
        { from: 'confirm', to: 'pack' },
        { from: 'pack', to: 'track' },
        { from: 'track', to: 'done', label: 'delivered' },
        { from: 'track', to: 'exception', label: 'failed once' },
        { from: 'exception', to: 'verify', label: 'fix stock or data' },
        { from: 'exception', to: 'track', label: 'reschedule' },
        { from: 'exception', to: 'done', label: 'cancel order' },
      ],
    };
    for (const graph of [sample, loops]) {
      const layout = layoutFlow(graph, 'TB');
      for (const e of layout.edges) {
        if (!e.labelBox) continue;
        for (const n of layout.nodes) {
          const [nl, nt] = [n.x - NODE_W / 2, n.y - NODE_H / 2];
          const b = e.labelBox;
          const overlap =
            b.x < nl + NODE_W && nl < b.x + b.w && b.y < nt + NODE_H && nt < b.y + b.h;
          expect(overlap, `label "${e.label}" covers node ${n.id}`).toBe(false);
        }
      }
    }
  });

  test('rejects unknown ids, duplicate ids and self-loops', () => {
    const one = [{ id: 'a', label: 'A' }];
    expect(() => layoutFlow({ nodes: one, edges: [{ from: 'a', to: 'b' }] })).toThrow(
      /unknown node/,
    );
    expect(() => layoutFlow({ nodes: [...one, { id: 'a', label: 'A2' }], edges: [] })).toThrow(
      /duplicate/,
    );
    expect(() => layoutFlow({ nodes: one, edges: [{ from: 'a', to: 'a' }] })).toThrow(/self-loop/);
  });
});

describe('wrapLabel', () => {
  test('wraps Latin text on word boundaries', () => {
    expect(wrapLabel('Compute the total cost of ingredients')).toEqual([
      'Compute the total cost',
      'of ingredients',
    ]);
  });

  test('cuts overflow to two lines with an ellipsis', () => {
    const lines = wrapLabel('one two three four five six seven eight nine ten eleven twelve');
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    for (const l of lines) expect(textUnits(l)).toBeLessThanOrEqual(22);
  });

  test('splits CJK text that has no spaces by width', () => {
    const lines = wrapLabel('这是一个非常长的中文标签需要被拆分成多行显示以免溢出');
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(textUnits(l)).toBeLessThanOrEqual(22);
    expect(lines[1].endsWith('…')).toBe(true);
  });
});

describe('renderFlowHtml', () => {
  test('escapes labels and keeps the widget config parseable', () => {
    const graph: FlowGraph = {
      nodes: [
        { id: 'a', label: '<img src=x onerror=alert(1)>', details: '</script><b>x</b>' },
        { id: 'b', label: 'B' },
      ],
      edges: [{ from: 'a', to: 'b', label: '<i>' }],
    };
    const html = renderFlowHtml(graph, { title: 'T' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(extractWidgetConfig(html, 'diagram')).toMatchObject({
      type: 'diagram',
      nodes: graph.nodes,
      edges: graph.edges,
    });
  });

  test('exposes the platform widget-action contract and the first step is the source node', () => {
    const html = renderFlowHtml(sample);
    for (const type of [
      'SET_WIDGET_STATE',
      'HIGHLIGHT_ELEMENT',
      'ANNOTATE_ELEMENT',
      'REVEAL_ELEMENT',
    ]) {
      expect(html).toContain(type);
    }
    expect(html).toContain('id="node-start"');
    const config = extractWidgetConfig(html, 'diagram') as unknown as { revealOrder: string[] };
    expect(config.revealOrder).toHaveLength(sample.nodes.length);
    expect(config.revealOrder.slice(0, 2)).toEqual(['start', 'check']);
  });
});

describe('PALETTE', () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  test('text meets WCAG AA and connectors stay visible on the dark background', () => {
    expect(contrast(PALETTE.ink, PALETTE.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.ink, PALETTE.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.inkStrong, PALETTE.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.inkStrong, PALETTE.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.muted, PALETTE.bg)).toBeGreaterThanOrEqual(3);
  });
});
