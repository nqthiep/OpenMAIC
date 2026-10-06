import { describe, expect, it } from 'vitest';
import {
  circleLayout,
  describeGraph,
  edgeGeometry,
  edgeKind,
  edgeOffsets,
  edgeText,
  GROUPS,
  headPoints,
  knownKind,
  layoutNodes,
  parseGraph,
  shownLabel,
  type GraphNodeIn,
  type NodeBox,
} from '@/lib/tutor/runtime/visualizers/graph';

const W = 480;
const H = 320;
const node = (id: string, x?: number, y?: number): GraphNodeIn => ({
  id,
  label: id,
  ...(x === undefined ? {} : { x, y }),
});
const ids = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('circleLayout', () => {
  it('0 và 1 node: rỗng / ở tâm', () => {
    expect(circleLayout(0, 100, 80)).toEqual([]);
    expect(circleLayout(1, 100, 80)).toEqual([{ x: 50, y: 40 }]);
  });

  it('node đầu ở đỉnh, các node cách đều tâm và nằm trong vùng chừa lề', () => {
    const pts = circleLayout(6, 200, 200, 20);
    expect(pts[0].x).toBeCloseTo(100);
    expect(pts[0].y).toBeCloseTo(20);
    for (const p of pts) {
      expect(dist(p, { x: 100, y: 100 })).toBeCloseTo(80);
      expect(p.x).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(180 + 1e-9);
    }
    expect(pts[3].y).toBeCloseTo(180); // đối xỉnh với đỉnh
    expect(pts[1].x).toBeGreaterThan(100); // chiều kim đồng hồ
  });
});

describe('layoutNodes', () => {
  it('1 node không toạ độ: ở tâm khung', () => {
    const [b] = layoutNodes([node('A')], W, H);
    expect(b.x).toBe(W / 2);
    expect(b.y).toBe(H / 2);
    expect(b.rx).toBeGreaterThanOrEqual(b.ry);
  });

  it('không toạ độ: xếp vòng tròn, node nằm trọn trong khung và không chồng nhau (1 đến 16 node)', () => {
    for (let n = 1; n <= 16; n++) {
      const boxes = layoutNodes(
        ids(n).map((i) => node(i)),
        W,
        H,
      );
      expect(boxes).toHaveLength(n);
      for (const b of boxes) {
        expect(b.x - b.rx).toBeGreaterThanOrEqual(0);
        expect(b.x + b.rx).toBeLessThanOrEqual(W);
        expect(b.y - b.ry).toBeGreaterThanOrEqual(0);
        expect(b.y + b.ry).toBeLessThanOrEqual(H);
      }
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          expect(dist(boxes[i], boxes[j]), `n=${n} ${i},${j}`).toBeGreaterThanOrEqual(
            boxes[i].ry + boxes[j].ry,
          );
    }
  });

  it('có toạ độ: co giãn đều vào khung, canh giữa, giữ tỉ lệ', () => {
    const boxes = layoutNodes([node('A', 0, 0), node('B', 10, 0), node('C', 10, 5)], 200, 200, 20);
    const [a, b, c] = boxes;
    expect(a.x).toBeCloseTo(20);
    expect(b.x).toBeCloseTo(180);
    expect(a.y).toBeCloseTo(b.y);
    expect(c.y - b.y).toBeCloseTo((c.x - a.x) / 2); // 5 : 10 như dữ liệu
    expect((a.y + c.y) / 2).toBeCloseTo(100); // canh giữa theo chiều dọc
  });

  it('toạ độ trùng nhau hoàn toàn hoặc một node: về tâm khung, không NaN', () => {
    for (const nodes of [[node('A', 3, 3)], [node('A', 3, 3), node('B', 3, 3)]]) {
      for (const b of layoutNodes(nodes, W, H)) {
        expect(b.x).toBe(W / 2);
        expect(b.y).toBe(H / 2);
        expect(Number.isFinite(b.rx + b.ry)).toBe(true);
      }
    }
  });

  it('chỉ một phần node có toạ độ: coi như không có, xếp vòng tròn', () => {
    const boxes = layoutNodes([node('A', 0, 0), node('B'), node('C', 5, 5)], 200, 200, 20);
    const circle = circleLayout(3, 200, 200, 20);
    boxes.forEach((b, i) => {
      expect(b.x).toBeCloseTo(circle[i].x);
      expect(b.y).toBeCloseTo(circle[i].y);
    });
  });

  it('nhãn dài làm node rộng ra và bị cắt ở 14 ký tự', () => {
    const [short, long] = layoutNodes(
      [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'A (d=3) rất rất dài dòng' },
      ],
      W,
      H,
    );
    expect(long.rx).toBeGreaterThan(short.rx);
    expect(Array.from(long.label)).toHaveLength(14);
    expect(long.label.endsWith('…')).toBe(true);
    expect(shownLabel('A (d=3)')).toBe('A (d=3)');
  });
});

describe('edgeGeometry', () => {
  const mk = (id: string, x: number, y: number): NodeBox => ({
    id,
    label: id,
    x,
    y,
    rx: 20,
    ry: 10,
  });
  const A = mk('A', 100, 100);
  const B = mk('B', 300, 100);

  it('cạnh thẳng nằm trên viền hai node, điểm giữa ở giữa', () => {
    const g = edgeGeometry(A, B, false, 0);
    expect(g.head).toBeNull();
    expect(g.d).toBe('M120 100Q200 100 280 100');
    expect(g.mid).toEqual({ x: 200, y: 100 });
  });

  it('có hướng: mũi tên chạm viền node đích, đường dừng ở gốc mũi tên', () => {
    const g = edgeGeometry(A, B, true, 0);
    expect(g.head!.tip).toEqual({ x: 280, y: 100 });
    expect(g.head!.dir).toEqual({ x: 1, y: 0 });
    expect(g.d).toBe('M120 100Q200 100 270 100');
    expect(headPoints(g.head!.tip, g.head!.dir)).toBe('280,100 270,104.5 270,95.5');
  });

  it('cạnh chéo: điểm đầu/cuối nằm đúng trên elip của node', () => {
    const C = mk('C', 200, 220);
    const g = edgeGeometry(A, C, true, 0);
    const tip = g.head!.tip;
    expect(((tip.x - C.x) / C.rx) ** 2 + ((tip.y - C.y) / C.ry) ** 2).toBeCloseTo(1);
    const [, sx, sy] = g.d.match(/^M(-?[\d.]+) (-?[\d.]+)/)!.map(Number);
    expect(((sx - A.x) / A.rx) ** 2 + ((sy - A.y) / A.ry) ** 2).toBeCloseTo(1);
  });

  it('offset khác 0 làm cong về một phía; offset ngược dấu cong phía kia', () => {
    const up = edgeGeometry(A, B, false, 24);
    const down = edgeGeometry(A, B, false, -24);
    expect(up.mid.y).toBeGreaterThan(100);
    expect(down.mid.y).toBeLessThan(100);
    expect(up.mid.y - 100).toBeCloseTo(100 - down.mid.y);
  });

  it('cạnh vòng: vòng phía trên node, mũi tên chỉ xuống', () => {
    const g = edgeGeometry(A, A, true, 0);
    expect(g.mid.y).toBeLessThan(A.y - A.ry);
    expect(g.head!.dir).toEqual({ x: 0, y: 1 });
    expect(g.head!.tip.y).toBe(A.y - A.ry);
    expect(g.d).toMatch(/^M[^C]*C/);
  });

  it('hai node trùng toạ độ không sinh NaN', () => {
    const g = edgeGeometry(A, mk('B', 100, 100), true, 0);
    expect(g.d).not.toContain('NaN');
    expect(headPoints(g.head!.tip, g.head!.dir)).not.toContain('NaN');
  });
});

describe('edgeOffsets', () => {
  const order = new Map([
    ['A', 0],
    ['B', 1],
    ['C', 2],
  ]);

  it('cạnh đơn: thẳng', () => {
    expect(
      edgeOffsets(
        [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
        ],
        order,
      ),
    ).toEqual([0, 0]);
  });

  it('hai cạnh ngược chiều A→B, B→A: đường cong nằm hai phía khác nhau', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ];
    const [o1, o2] = edgeOffsets(edges, order);
    expect(o1).not.toBe(0);
    const mk = (id: string, x: number): NodeBox => ({ id, label: id, x, y: 100, rx: 20, ry: 10 });
    const [A, B] = [mk('A', 100), mk('B', 300)];
    const side1 = edgeGeometry(A, B, true, o1).mid.y - 100;
    const side2 = edgeGeometry(B, A, true, o2).mid.y - 100;
    expect(side1 * side2).toBeLessThan(0);
  });

  it('ba cạnh song song: đối xứng quanh đường thẳng', () => {
    const o = edgeOffsets(
      Array.from({ length: 3 }, () => ({ from: 'A', to: 'C' })),
      order,
    );
    expect(o[1]).toBe(0);
    expect(o[0]).toBe(-o[2]);
  });
});

describe('parseGraph, edgeText, kind', () => {
  it('bỏ node trùng id, cạnh tới node không có, dữ liệu rác; id số thành chuỗi', () => {
    const g = parseGraph({
      nodes: [{ id: 1, x: 1, y: 2 }, { id: '1' }, { id: 'B', label: 'B (d=3)', x: 'x' }, null, 5],
      edges: [
        { from: 1, to: 'B', weight: 3, directed: true },
        { from: 'B', to: 'zz' },
        { from: 'B' },
        'x',
      ],
    });
    expect(g.nodes.map((n) => n.id)).toEqual(['1', 'B']);
    expect(g.nodes[0]).toEqual({ id: '1', label: '1', x: 1, y: 2 });
    expect(g.nodes[1]).toEqual({ id: 'B', label: 'B (d=3)' }); // x không phải số: không có toạ độ
    expect(g.edges).toEqual([{ from: '1', to: 'B', directed: true, text: '3' }]);
  });

  it('state không phải đối tượng: đồ thị rỗng', () => {
    for (const s of [undefined, null, 3, 'x', [], {}, { nodes: 'a', edges: 1 }])
      expect(parseGraph(s)).toEqual({ nodes: [], edges: [] });
  });

  it('edgeText: trọng số rồi nhãn', () => {
    expect(edgeText(5, '3/5')).toBe('5 3/5');
    expect(edgeText(0, undefined)).toBe('0');
    expect(edgeText(undefined, '3/5')).toBe('3/5');
    expect(edgeText(undefined, undefined)).toBe('');
    expect(edgeText(NaN, {})).toBe('');
  });

  it('knownKind nhận 5 kind chung và group-0…5, bỏ phần còn lại', () => {
    for (const k of ['active', 'compare', 'result', 'visited', 'muted', 'group-0', 'group-5'])
      expect(knownKind(k)).toBe(k);
    for (const k of ['group-6', 'group-', 'bogus', 3, null, undefined, '__proto__'])
      expect(knownKind(k)).toBeUndefined();
  });

  it('edgeKind: có hướng thì đúng chiều, vô hướng thì cả hai chiều', () => {
    const hl = { 'A-B': 'result' };
    expect(edgeKind({ from: 'A', to: 'B', directed: true }, hl)).toBe('result');
    expect(edgeKind({ from: 'B', to: 'A', directed: true }, hl)).toBeUndefined();
    expect(edgeKind({ from: 'B', to: 'A', directed: false }, hl)).toBe('result');
    expect(edgeKind({ from: 'A', to: 'B', directed: false }, { 'A-B': 'x' })).toBeUndefined();
  });
});

describe('describeGraph', () => {
  it('nêu node (kèm loại tô sáng) rồi cạnh (kèm hướng, trọng số, loại)', () => {
    const g = parseGraph({
      nodes: [{ id: 'A', label: 'A (d=0)' }, { id: 'B' }, { id: 'C' }],
      edges: [
        { from: 'A', to: 'B', weight: 3, directed: true },
        { from: 'B', to: 'C', label: '2/5' },
      ],
    });
    expect(describeGraph(g, { A: 'active', 'A-B': 'result', 'C-B': 'group-2' })).toBe(
      'A (d=0) (active), B, C; A (d=0)→B 3 (result), B–C 2/5 (group-2)',
    );
  });

  it('không cạnh: chỉ node; không node: rỗng', () => {
    expect(describeGraph(parseGraph({ nodes: [{ id: 'A' }, { id: 'B' }] }), {})).toBe('A, B');
    expect(describeGraph(parseGraph({}), {})).toBe('');
  });
});

describe('bảng màu group-0…5', () => {
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lum = (c: string) => {
    const [r, g, b] = hex(c).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // --wt-bg và --wt-fg của shell (lib/tutor/build/shell.ts)
  const SHELL = { light: { bg: '#ffffff', fg: '#1f2937' }, dark: { bg: '#111827', fg: '#e5e7eb' } };

  it.each(['light', 'dark'] as const)(
    '%s: viền >= 3:1 với nền, chữ >= 4.5:1 trên nền tô',
    (scheme) => {
      for (const [i, g] of GROUPS.entries()) {
        expect(
          contrast(g[scheme].stroke, SHELL[scheme].bg),
          `group-${i} stroke`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrast(SHELL[scheme].fg, g[scheme].fill),
          `group-${i} text`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('6 nhóm khác nhau về màu viền và nét đứt (không chỉ dựa vào màu)', () => {
    expect(GROUPS).toHaveLength(6);
    for (const scheme of ['light', 'dark'] as const)
      expect(new Set(GROUPS.map((g) => g[scheme].stroke)).size).toBe(6);
    expect(new Set(GROUPS.map((g) => g.dash)).size).toBe(6);
  });
});
