import { describe, expect, it } from 'vitest';
import { layoutBars, layoutPointers } from '@/lib/tutor/runtime/visualizers/array';

describe('layoutBars', () => {
  it('mảng 1 phần tử: một cột dương chạm đỉnh, nằm giữa vùng vẽ, đáy trên đường gốc', () => {
    const { baseline, scale, bars } = layoutBars([7], 100, 50);
    expect(baseline).toBe(50);
    expect(scale).toBeCloseTo(50 / 7);
    expect(bars).toHaveLength(1);
    const [b] = bars;
    expect(b.cx).toBe(50);
    expect(b.y).toBeCloseTo(0);
    expect(b.height).toBeCloseTo(50);
    expect(b.y + b.height).toBeCloseTo(baseline);
    expect(b.width).toBeGreaterThan(0);
    expect(b.width).toBeLessThan(100); // chặn bề ngang tối đa, không phình theo cả vùng vẽ
    expect(b.x).toBeCloseTo(b.cx - b.width / 2);
  });

  it('số âm treo dưới đường gốc, cùng thang với số dương', () => {
    const { baseline, scale, bars } = layoutBars([-3, 6, 0], 90, 90);
    expect(scale).toBeCloseTo(10); // 90 / (6 − (−3))
    expect(baseline).toBeCloseTo(60);
    const [neg, pos, zero] = bars;
    expect(neg.y).toBeCloseTo(baseline);
    expect(neg.height).toBeCloseTo(30);
    expect(neg.y + neg.height).toBeLessThanOrEqual(90);
    expect(pos.y).toBeCloseTo(0);
    expect(pos.height).toBeCloseTo(60);
    expect(pos.y + pos.height).toBeCloseTo(baseline);
    expect(zero.height).toBe(0);
    expect(zero.y).toBeCloseTo(baseline);
  });

  it('chỉ có số âm: đường gốc ở đỉnh, cột treo xuống, sâu nhất chạm đáy', () => {
    const { baseline, bars } = layoutBars([-2, -4], 100, 40);
    expect(baseline).toBe(0);
    expect(bars[1].y).toBe(0);
    expect(bars[1].height).toBeCloseTo(40);
    expect(bars[0].height).toBeCloseTo(20);
  });

  it('toàn 0: không chia cho 0, mọi cột cao 0 trên đường gốc ở đáy', () => {
    const { baseline, scale, bars } = layoutBars([0, 0, 0], 120, 60);
    expect(scale).toBe(0);
    expect(baseline).toBe(60);
    for (const b of bars) {
      expect(b.height).toBe(0);
      expect(b.y).toBe(60);
    }
  });

  it('12 phần tử: ô đều nhau, cột không chồng, nằm trong vùng vẽ, chiều cao tỉ lệ', () => {
    const values = [-999, -500, -120, -3, 0, 1, 4, 20, 77, 300, 640, 999];
    const { baseline, scale, bars } = layoutBars(values, 480, 130);
    expect(bars).toHaveLength(12);
    bars.forEach((b, i) => {
      expect(b.index).toBe(i);
      expect(b.value).toBe(values[i]);
      expect(b.cx).toBeCloseTo((i + 0.5) * 40);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(480);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(130 + 1e-9);
      if (i > 0) expect(b.x).toBeGreaterThanOrEqual(bars[i - 1].x + bars[i - 1].width);
    });
    expect(baseline).toBeCloseTo(999 * scale);
    expect(bars[11].height).toBeCloseTo(999 * scale);
    expect(bars[9].height / bars[10].height).toBeCloseTo(300 / 640);
  });

  it('giá trị nhỏ khác 0 vẫn có cột nhìn thấy được', () => {
    const { bars } = layoutBars([1, 100000], 100, 100);
    expect(bars[0].height).toBeGreaterThanOrEqual(1);
  });

  it('`extra` (vạch ngưỡng) nằm trong thang dù lớn hơn mọi cột', () => {
    const { baseline, scale, bars } = layoutBars([2, 4], 100, 100, [10]);
    expect(baseline - 10 * scale).toBeGreaterThanOrEqual(-1e-9);
    expect(bars[1].height).toBeCloseTo(40);
  });

  it('mảng rỗng và giá trị không phải số hữu hạn không ném lỗi', () => {
    expect(layoutBars([], 100, 50).bars).toEqual([]);
    const { bars } = layoutBars([NaN, Infinity, 'x', null, '5'], 100, 50);
    expect(bars.map((b) => b.value)).toEqual([0, 0, 0, 0, 5]);
  });
});

describe('layoutPointers', () => {
  it('con trỏ trong miền: nhãn là tên, mỗi con trỏ một làn', () => {
    expect(layoutPointers({ lo: 0, mid: 3, hi: 5 }, 6)).toEqual([
      { name: 'lo', index: 0, label: 'lo', lane: 0, lanes: 1 },
      { name: 'mid', index: 3, label: 'mid', lane: 0, lanes: 1 },
      { name: 'hi', index: 5, label: 'hi', lane: 0, lanes: 1 },
    ]);
  });

  it('cùng một ô thì chia làn theo thứ tự khoá', () => {
    const marks = layoutPointers({ lo: 2, mid: 2, hi: 2 }, 5);
    expect(marks.map((m) => [m.lane, m.lanes])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
  });

  it('ngoài miền kẹp vào ô đầu/cuối, nhãn kèm giá trị', () => {
    const marks = layoutPointers({ hi: -1, lo: 4 }, 4);
    expect(marks[0]).toMatchObject({ name: 'hi', index: 0, label: 'hi=-1' });
    expect(marks[1]).toMatchObject({ name: 'lo', index: 3, label: 'lo=4' });
  });

  it('bỏ con trỏ không phải số nguyên; nhận chuỗi số; không ném lỗi với đầu vào lạ', () => {
    expect(layoutPointers({ a: 1.5, b: 'x', c: null, d: '2' }, 5).map((m) => m.name)).toEqual([
      'd',
    ]);
    expect(layoutPointers(undefined, 5)).toEqual([]);
    expect(layoutPointers([1, 2], 5)).toEqual([]);
    expect(layoutPointers({ lo: 0 }, 0)).toEqual([]);
  });
});
