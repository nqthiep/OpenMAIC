import { describe, expect, it } from 'vitest';
import {
  describeForest,
  GROUP_PALETTE,
  layoutForest,
  layoutPointers,
  MAX_NODES,
  parseNodes,
  type ForestNode,
} from '@/lib/tutor/runtime/visualizers/tree';

const W = 400;
const H = 300;
const node = (id: string, parent?: string): ForestNode => ({ id, label: id.toUpperCase(), parent });

/** Mọi node nằm trong vùng vẽ, không hai node chồng nhau (khoảng cách tâm >= 2r). */
function expectSound(nodes: readonly ForestNode[], width = W, height = H) {
  const lay = layoutForest(nodes, width, height);
  for (const b of lay.nodes) {
    expect(b.x - lay.r).toBeGreaterThanOrEqual(-1e-9);
    expect(b.x + lay.r).toBeLessThanOrEqual(width + 1e-9);
    expect(b.y - lay.r).toBeGreaterThanOrEqual(-1e-9);
    expect(b.y + lay.r).toBeLessThanOrEqual(height + 1e-9);
  }
  for (const [i, a] of lay.nodes.entries()) {
    for (const b of lay.nodes.slice(i + 1)) {
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * lay.r - 1e-9);
    }
  }
  return lay;
}

describe('layoutForest', () => {
  it('rỗng: không node, 0 tầng', () => {
    expect(layoutForest([], W, H)).toEqual({ nodes: [], r: 0, levels: 0 });
  });

  it('1 node: nằm giữa vùng vẽ', () => {
    const lay = expectSound([node('a')]);
    expect(lay.levels).toBe(1);
    expect(lay.nodes).toHaveLength(1);
    expect(lay.nodes[0]).toMatchObject({ id: 'a', x: W / 2, y: H / 2, depth: 0 });
    expect(lay.r).toBeGreaterThan(0);
  });

  it('chuỗi 8 node: 8 tầng cùng một cột, y tăng đều', () => {
    const chain = Array.from({ length: 8 }, (_, i) => node(`n${i}`, i ? `n${i - 1}` : undefined));
    const lay = expectSound(chain, W, 448);
    expect(lay.levels).toBe(8);
    expect(lay.nodes.map((b) => b.depth)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const b of lay.nodes) expect(b.x).toBe(W / 2);
    for (let i = 1; i < 8; i++) {
      expect(lay.nodes[i].y - lay.nodes[i - 1].y).toBeCloseTo(448 / 8);
      expect(lay.nodes[i].parent).toBe(`n${i - 1}`);
    }
  });

  it('rừng 2 cây: các cây đứng cạnh nhau theo thứ tự gốc, mỗi cha ở giữa con đầu và con cuối', () => {
    const forest = [
      node('a'),
      node('b', 'a'),
      node('c', 'a'),
      node('d', 'a'),
      node('x'),
      node('y', 'x'),
      node('z', 'x'),
    ];
    const lay = expectSound(forest);
    const at = (id: string) => lay.nodes.find((b) => b.id === id)!;
    expect(at('a').x).toBeCloseTo(at('c').x); // 3 con: cha trùng cột con giữa
    expect(at('x').x).toBeCloseTo((at('y').x + at('z').x) / 2);
    expect(at('b').x).toBeLessThan(at('c').x);
    expect(at('c').x).toBeLessThan(at('d').x);
    expect(at('d').x).toBeLessThan(at('y').x); // cây 2 hoàn toàn bên phải cây 1
    expect(at('a').x).toBeLessThan(at('x').x);
    expect(at('a').depth).toBe(0);
    expect(at('x').depth).toBe(0);
  });

  it('cây đủ 31 node (nhị phân đầy đủ, 5 tầng): không chồng, trong vùng vẽ, con dàn đều dưới cha', () => {
    const full: ForestNode[] = [node('1')];
    for (let i = 2; i <= 31; i++) full.push(node(String(i), String(Math.floor(i / 2))));
    const lay = expectSound(full, 480, 280);
    expect(lay.nodes).toHaveLength(MAX_NODES);
    expect(lay.levels).toBe(5);
    const at = (id: string) => lay.nodes.find((b) => b.id === id)!;
    for (let p = 1; p <= 15; p++) {
      const l = at(String(2 * p));
      const r = at(String(2 * p + 1));
      expect(at(String(p)).x).toBeCloseTo((l.x + r.x) / 2);
      expect(l.x).toBeLessThan(r.x);
    }
    const leaves = lay.nodes.filter((b) => b.depth === 4).map((b) => b.x);
    for (let i = 1; i < leaves.length; i++) {
      expect(leaves[i] - leaves[i - 1]).toBeCloseTo(480 / 16);
    }
  });

  it('quá 31 node: chỉ lấy 31 node đầu', () => {
    const many = Array.from({ length: 40 }, (_, i) => node(`n${i}`, i ? 'n0' : undefined));
    const lay = expectSound(many);
    expect(lay.nodes.map((b) => b.id)).toEqual(many.slice(0, MAX_NODES).map((n) => n.id));
  });

  it('dữ liệu hỏng không làm hỏng bố cục: id trùng, cha lạ, vòng cha-con', () => {
    const lay = expectSound([
      node('a'),
      node('a'), // trùng: bỏ
      node('b', 'ghost'), // cha không có: thành gốc
      node('c', 'd'),
      node('d', 'c'), // vòng: bỏ
      node('e', 'e'), // tự làm cha: bỏ
    ]);
    expect(lay.nodes.map((b) => b.id)).toEqual(['a', 'b']);
    expect(lay.nodes.every((b) => b.depth === 0 && b.parent === undefined)).toBe(true);
  });
});

describe('parseNodes', () => {
  it('bỏ phần tử sai kiểu, ép id số thành chuỗi, label mặc định là id', () => {
    expect(parseNodes('x')).toEqual([]);
    expect(
      parseNodes([null, 3, { id: '' }, { id: 7, parent: 1, note: 'n' }, { id: 'a', label: {} }]),
    ).toEqual([
      { id: '7', label: '7', parent: '1', note: 'n', edgeLabel: undefined },
      { id: 'a', label: 'a', parent: undefined, note: undefined, edgeLabel: undefined },
    ]);
  });
});

describe('layoutPointers', () => {
  const ids = new Set(['a', 'b']);
  it('chỉ giữ con trỏ trỏ vào id có thật; cùng node thì xếp chồng theo lane', () => {
    expect(layoutPointers({ cur: 'a', prev: 'a', gone: 'zz', bad: true, n: 'b' }, ids)).toEqual([
      { name: 'cur', node: 'a', lane: 0 },
      { name: 'prev', node: 'a', lane: 1 },
      { name: 'n', node: 'b', lane: 0 },
    ]);
    expect(layoutPointers(undefined, ids)).toEqual([]);
  });
});

describe('describeForest', () => {
  it('mô tả gốc/con, loại tô sáng, con trỏ, nhãn cạnh và ghi chú', () => {
    const nodes: ForestNode[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', parent: 'a', edgeLabel: 'x', note: 'fail→A' },
    ];
    const lay = layoutForest(nodes, W, H);
    const marks = layoutPointers({ cur: 'b' }, new Set(['a', 'b']));
    expect(describeForest(nodes, lay, { a: 'result', b: 'group-2' }, marks)).toBe(
      'A (gốc, result); B (con của A, group-2, cur, cạnh x, fail→A)',
    );
    expect(describeForest(nodes, lay, { b: 'bogus' }, [])).toBe(
      'A (gốc); B (con của A, cạnh x, fail→A)',
    );
  });
});

describe('GROUP_PALETTE', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  it.each(['light', 'dark'] as const)(
    '%s: chữ >= 4.5:1 trên nền nhóm, viền >= 3:1 với nền',
    (s) => {
      const p = GROUP_PALETTE[s];
      expect(p.fill).toHaveLength(6);
      p.fill.forEach((fill, k) => {
        expect(ratio(p.fg, fill), `fill ${k}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(p.stroke[k], p.bg), `stroke ${k}`).toBeGreaterThanOrEqual(3);
      });
    },
  );
});
