import { describe, expect, it } from 'vitest';
import {
  GROUP_KINDS,
  GROUP_STYLES,
  clipText,
  describeArray,
  describeBars,
  layoutBars,
  layoutGrid,
  layoutIntervalLanes,
  layoutPointers,
  parseIntervals,
  parseMode,
  parseRows,
} from '@/lib/tutor/runtime/visualizers/array';

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

describe('describeBars (aria-label)', () => {
  it('announces highlights and pointers per cell', () => {
    const marks = layoutPointers({ lo: 0, mid: 2, hi: 3 }, 4);
    expect(describeBars([5, 8, 13, 21], { '1': 'compare', '2': 'active' }, marks)).toBe(
      '5 (lo), 8 (compare), 13 (active, mid), 21 (hi)',
    );
  });

  it('plain values when nothing is marked; unknown kinds are ignored', () => {
    expect(describeBars([1, 2], {}, [])).toBe('1, 2');
    expect(describeBars([1, 2], { '0': 'bogus' }, [])).toBe('1, 2');
  });

  it('keeps the value of an out-of-range pointer in its label', () => {
    expect(describeBars([4, 9], { '0': 'muted' }, layoutPointers({ hi: -1 }, 2))).toBe(
      '4 (muted, hi=-1), 9',
    );
  });
});

describe('parseMode / parseRows / parseIntervals', () => {
  it('mode defaults to bars; cells and bits are accepted', () => {
    expect(['cells', 'bits', 'bars', 'x', undefined, 3].map(parseMode)).toEqual([
      'cells',
      'bits',
      'bars',
      'bars',
      'bars',
      'bars',
    ]);
  });

  it('rows: keeps valid cells and null, drops junk, truncates offset, caps at 8 rows', () => {
    const rows = parseRows([
      { label: 'sum', values: [0, 'a', null, NaN, {}, 7], offset: 1.9 },
      { label: 'bad' },
      'x',
      { label: 'far', values: [1], offset: 'nope' },
    ]);
    expect(rows).toEqual([
      { label: 'sum', values: [0, 'a', null, null, null, 7], offset: 1 },
      { label: 'far', values: [1], offset: 0 },
    ]);
    expect(parseRows(Array.from({ length: 20 }, () => ({ label: 'r', values: [] })))).toHaveLength(
      8,
    );
    expect(parseRows(undefined)).toEqual([]);
    expect(parseRows([{ label: 'r', values: [], offset: -1e9 }])[0].offset).toBe(-4096);
  });

  it('intervals: needs id, finite start <= end, unique id; label defaults to id', () => {
    expect(
      parseIntervals([
        { id: 'a', start: 0, end: 3 },
        { id: 'a', start: 5, end: 6 },
        { id: 'b', start: 4, end: 2 },
        { id: '', start: 0, end: 1 },
        { id: 'c', start: 'x', end: 1 },
        { id: 'd', start: '1', end: 1, label: 'pt' },
      ]),
    ).toEqual([
      { id: 'a', start: 0, end: 3, label: 'a' },
      { id: 'd', start: 1, end: 1, label: 'pt' },
    ]);
  });
});

describe('layoutGrid / layoutIntervalLanes / clipText', () => {
  it('without extras the grid is the main row', () => {
    expect(layoutGrid(5, [], [])).toEqual({ colStart: 0, cols: 5 });
    expect(layoutGrid(0, [], [])).toEqual({ colStart: 0, cols: 0 });
  });

  it('rows with offsets and intervals widen the grid on both sides', () => {
    const rows = parseRows([
      { label: 'p', values: [1, 2], offset: -2 },
      { label: 'q', values: [1, 2, 3], offset: 4 },
    ]);
    expect(layoutGrid(3, rows, [])).toEqual({ colStart: -2, cols: 9 });
    const ivs = parseIntervals([{ id: 'i', start: -3.5, end: 10.2 }]);
    expect(layoutGrid(3, rows, ivs)).toEqual({ colStart: -4, cols: 15 });
  });

  it('lanes: touching intervals share a lane, overlapping ones do not, input order kept', () => {
    const ivs = parseIntervals([
      { id: 'a', start: 3, end: 5 },
      { id: 'b', start: 0, end: 3 },
      { id: 'c', start: 2, end: 4 },
      { id: 'd', start: 5, end: 6 },
    ]);
    expect(layoutIntervalLanes(ivs)).toEqual([0, 0, 1, 0]);
    expect(layoutIntervalLanes([])).toEqual([]);
  });

  it('clipText cuts by code point and marks the cut', () => {
    expect(clipText('abc', 3)).toBe('abc');
    expect(clipText('abcdef', 4)).toBe('abc…');
    expect(clipText('abcdef', 0)).toBe('');
    expect(clipText('a😀b😀c', 3)).toBe('a😀…');
  });
});

describe('describeArray (aria-label)', () => {
  it('equals describeBars when there are no rows or intervals', () => {
    expect(describeArray([1, 2], { '0': 'active' }, [])).toBe('1 (active), 2');
  });

  it('adds rows and intervals with their kinds', () => {
    const rows = parseRows([{ label: 'sum', values: [0, 3, null] }]);
    const ivs = parseIntervals([{ id: 'w', start: 1, end: 3, label: 'window' }]);
    expect(describeArray([3, 1], { 'r0:1': 'result', w: 'group-2' }, [], rows, ivs)).toBe(
      '3, 1; sum: 0, 3 (result), empty; window [1, 3) (group-2)',
    );
  });
});

describe('group palette', () => {
  const WHITE = '#ffffff';
  const DARK_BG = '#111827'; // --wt-bg dark của shell
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

  it('has group-0 … group-5', () => {
    expect(GROUP_KINDS).toEqual([0, 1, 2, 3, 4, 5].map((k) => `group-${k}`));
    expect(GROUP_STYLES).toHaveLength(6);
  });

  it('strokes are >= 3:1 against the shell background in both schemes', () => {
    for (const g of GROUP_STYLES) {
      expect(ratio(g.light, WHITE)).toBeGreaterThanOrEqual(3);
      expect(ratio(g.dark, DARK_BG)).toBeGreaterThanOrEqual(3);
    }
  });

  it('groups differ by colour and by stroke pattern, not colour alone', () => {
    for (const k of ['light', 'dark'] as const) {
      expect(new Set(GROUP_STYLES.map((g) => g[k])).size).toBe(6);
    }
    expect(new Set(GROUP_STYLES.map((g) => `${g.dash}/${g.width}`)).size).toBe(6);
  });
});
