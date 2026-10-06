import { describe, expect, it } from 'vitest';
import {
  GROUP_PALETTE,
  MAX_COLS,
  MAX_ROWS,
  cellText,
  clip,
  describeGrid,
  gridLayout,
  gridSize,
  layoutArrows,
} from '@/lib/tutor/runtime/visualizers/grid';
import { SHELL_CSS } from '@/lib/tutor/build/shell';

describe('gridLayout', () => {
  it('1×1: một ô trong vùng vẽ, tâm ô nằm giữa ô', () => {
    const { cell, gridW, gridH, cells } = gridLayout(1, 1, 100, 100);
    expect(cells).toHaveLength(1);
    expect(cell).toBeLessThanOrEqual(44); // chặn cỡ ô tối đa
    expect(gridW).toBe(cell);
    expect(gridH).toBe(cell);
    const [b] = cells;
    expect(b.cx).toBeCloseTo(b.x + b.size / 2);
    expect(b.cy).toBeCloseTo(b.y + b.size / 2);
  });

  it('ô vuông, đều nhau, không chồng nhau, nằm trong vùng vẽ', () => {
    const { cell, cells } = gridLayout(4, 5, 200, 200);
    expect(cells).toHaveLength(20);
    expect(cell).toBe(40); // min(200/5, 200/4, 44)
    cells.forEach((b, i) => {
      expect(b.r * 5 + b.c).toBe(i); // thứ tự theo hàng
      expect(b.size).toBeGreaterThan(0);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.size).toBeLessThanOrEqual(200);
      expect(b.y + b.size).toBeLessThanOrEqual(200);
      if (b.c > 0) expect(b.x).toBeGreaterThanOrEqual(cells[i - 1].x + cells[i - 1].size);
      if (b.r > 0) expect(b.y).toBeGreaterThanOrEqual(cells[i - 5].y + cells[i - 5].size);
    });
  });

  it('cỡ ô theo chiều hẹp hơn: 16 hàng × 13 cột (dp-bitmask) vừa khung 400×380', () => {
    const { cell, gridW, gridH, cells } = gridLayout(16, 13, 400, 380);
    expect(cells).toHaveLength(16 * 13);
    expect(cell).toBeCloseTo(380 / 16); // chiều cao hẹp hơn
    expect(gridW).toBeLessThanOrEqual(400);
    expect(gridH).toBeLessThanOrEqual(380 + 1e-9);
    const last = cells[cells.length - 1];
    expect(last.x + last.size).toBeLessThanOrEqual(gridW);
    expect(last.y + last.size).toBeLessThanOrEqual(gridH);
  });

  it('vượt giới hạn thì kẹp ở 16×13', () => {
    expect(gridLayout(99, 99, 400, 400).cells).toHaveLength(MAX_ROWS * MAX_COLS);
  });

  it('0 hàng/cột, số âm hoặc không nguyên: lưới rỗng, không ném lỗi', () => {
    for (const [r, c] of [
      [0, 5],
      [5, 0],
      [-1, 3],
      [2.5, 3],
      [NaN, 3],
    ]) {
      expect(gridLayout(r, c, 100, 100)).toEqual({ cell: 0, gridW: 0, gridH: 0, cells: [] });
    }
  });

  it('vùng vẽ nhỏ hơn khe: kích thước ô không âm', () => {
    for (const b of gridLayout(3, 3, 1, 1).cells) expect(b.size).toBeGreaterThanOrEqual(0);
  });
});

describe('gridSize', () => {
  it('lấy rows/cols khai báo, kẹp ở giới hạn', () => {
    expect(gridSize({ rows: 3, cols: 4, cells: [] })).toEqual({ rows: 3, cols: 4 });
    expect(gridSize({ rows: 40, cols: 40 })).toEqual({ rows: MAX_ROWS, cols: MAX_COLS });
  });

  it('thiếu hoặc sai kiểu thì suy ra từ cells', () => {
    expect(gridSize({ cells: [[1, 2, 3], [4]] })).toEqual({ rows: 2, cols: 3 });
    expect(gridSize({ rows: 'x', cols: -2, cells: [[1, 2]] })).toEqual({ rows: 1, cols: 2 });
    expect(gridSize({})).toEqual({ rows: 0, cols: 0 });
  });
});

describe('clip / cellText', () => {
  it('cắt theo ký tự, thêm …; không cắt khi vừa', () => {
    expect(clip('abcdefgh', 8)).toBe('abcdefgh');
    expect(clip('abcdefghi', 8)).toBe('abcdefg…');
    expect(clip('😀😀😀', 2)).toBe('😀…');
  });

  it('số, chuỗi, null, vô cực', () => {
    expect(cellText(7)).toBe('7');
    expect(cellText(-0.5)).toBe('-0.5');
    expect(cellText('ab')).toBe('ab');
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(Infinity)).toBe('∞');
    expect(cellText(-Infinity)).toBe('-∞');
  });
});

describe('layoutArrows', () => {
  const layout = gridLayout(3, 3, 120, 120);

  it('mũi tên đi từ ô này sang ô kia, rút ngắn ở hai đầu và nằm giữa hai tâm', () => {
    const [a] = layoutArrows([{ from: '0,0', to: '1,1' }], layout, 3, 3);
    const p = layout.cells[0];
    const q = layout.cells[4];
    expect(a.from).toBe('0,0');
    expect(a.to).toBe('1,1');
    // đầu mũi tên nằm trên đoạn nối hai tâm, cách tâm đích một khoảng > 0
    expect(a.x2).toBeLessThan(q.cx);
    expect(a.y2).toBeLessThan(q.cy);
    expect(a.x1).toBeGreaterThan(p.cx);
    expect(a.y1).toBeGreaterThan(p.cy);
    expect((a.x2 - a.x1) / (a.y2 - a.y1)).toBeCloseTo(1); // chéo 45°
  });

  it('bỏ khoá sai dạng, ngoài lưới, from = to, trùng cặp, phần tử không phải object', () => {
    const segs = layoutArrows(
      [
        { from: '0,0', to: '0,1' },
        { from: '0,0', to: '0,1' },
        { from: '1,1', to: '1,1' },
        { from: '0,0', to: '3,0' },
        { from: 'a,b', to: '0,0' },
        { from: '0,0' },
        null,
        7,
      ],
      layout,
      3,
      3,
    );
    expect(segs.map((s) => `${s.from}>${s.to}`)).toEqual(['0,0>0,1']);
  });

  it('không phải mảng thì rỗng', () => {
    expect(layoutArrows(undefined, layout, 3, 3)).toEqual([]);
    expect(layoutArrows({}, layout, 3, 3)).toEqual([]);
  });
});

describe('describeGrid (aria-label)', () => {
  it('đọc từng hàng, kèm loại tô sáng và nhãn hàng', () => {
    expect(
      describeGrid(
        [
          [0, 1],
          [2, null],
        ],
        2,
        2,
        { '0,1': 'active', '1,0': 'group-3', '1,1': 'bogus' },
        ['a', 'bb'],
      ),
    ).toBe('a: 0, 1 (active); bb: 2 (group-3), -');
  });

  it('nhãn hàng rỗng cũng dùng chỉ số', () => {
    expect(describeGrid([[1], [2]], 2, 1, {}, ['', 'b'])).toBe('0: 1; b: 2');
  });

  it('không có nhãn hàng thì dùng chỉ số; có mũi tên thì thêm ở cuối', () => {
    expect(
      describeGrid([[1]], 1, 1, {}, [], [{ from: '0,0', to: '0,0', x1: 0, y1: 0, x2: 0, y2: 0 }]),
    ).toBe('0: 1; arrows: 0,0→0,0');
  });

  it('nhãn quá 8 ký tự bị cắt; hàng thiếu dữ liệu không ném lỗi', () => {
    expect(describeGrid([], 1, 2, {}, ['123456789'])).toBe('1234567…: -, -');
  });
});

describe('group palette', () => {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = (h: string) => {
    const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const shellVar = (scheme: 'light' | 'dark', name: string) => {
    const block =
      scheme === 'dark'
        ? SHELL_CSS.match(/@media \(prefers-color-scheme:dark\)\{:root\{([^}]*)\}/)![1]
        : SHELL_CSS.match(/^:root\{([^}]*)\}/m)![1];
    const h = block.match(new RegExp(`${name}:(#[0-9a-f]{3,6})`, 'i'))![1];
    return h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join('')}` : h;
  };

  it('6 nhóm', () => expect(GROUP_PALETTE).toHaveLength(6));

  it.each(['light', 'dark'] as const)(
    '%s: viền >= 3:1 với nền, chữ --wt-fg >= 4.5:1 với nền ô',
    (scheme) => {
      const bg = shellVar(scheme, '--wt-bg');
      const fg = shellVar(scheme, '--wt-fg');
      for (const [i, g] of GROUP_PALETTE.entries()) {
        expect(ratio(g[scheme].stroke, bg), `${scheme} g${i} stroke`).toBeGreaterThanOrEqual(3);
        expect(ratio(fg, g[scheme].fill), `${scheme} g${i} text`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('mỗi nhóm có mẫu nét (dash + độ dày) và màu viền riêng, khác 5 kind của shell', () => {
    const looks = GROUP_PALETTE.map((g) => `${g.width}|${g.dash}`);
    expect(new Set(looks).size).toBe(GROUP_PALETTE.length);
    for (const scheme of ['light', 'dark'] as const) {
      expect(new Set(GROUP_PALETTE.map((g) => g[scheme].stroke)).size).toBe(6);
      for (const k of ['active', 'compare', 'result', 'visited', 'muted']) {
        const c = shellVar(scheme, `--wt-k-${k}`).toLowerCase();
        for (const g of GROUP_PALETTE) expect(g[scheme].stroke.toLowerCase()).not.toBe(c);
      }
    }
  });
});
