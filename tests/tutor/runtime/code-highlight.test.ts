import { describe, it, expect } from 'vitest';
import { codeLinesFor, type CodeMap } from '@/lib/tutor/runtime/code-highlight';
import { formatCounter } from '@/lib/tutor/runtime/layout';

// Khoá là chuỗi như sau JSON.parse; pseudo 3 chưa có dòng cài đặt cho py.
const map: CodeMap = {
  cpp: { '1': [4], '2': [5, 6], '3': [] },
  py: { '1': [2], '2': [3] },
};

describe('codeLinesFor', () => {
  it('pseudo trả đúng dòng pseudocode', () => {
    expect(codeLinesFor('pseudo', 3, map)).toEqual([3]);
  });

  it('cpp/py tra bản đồ theo dòng pseudo', () => {
    expect(codeLinesFor('cpp', 1, map)).toEqual([4]);
    expect(codeLinesFor('cpp', 2, map)).toEqual([5, 6]);
    expect(codeLinesFor('py', 2, map)).toEqual([3]);
  });

  it('thiếu khoá, mảng rỗng hoặc thiếu ngôn ngữ thì []', () => {
    expect(codeLinesFor('py', 3, map)).toEqual([]);
    expect(codeLinesFor('cpp', 3, map)).toEqual([]);
    expect(codeLinesFor('cpp', 99, map)).toEqual([]);
    expect(codeLinesFor('py', 1, {})).toEqual([]);
  });

  it('frame không có codeLine (hoặc không phải số nguyên) thì []', () => {
    expect(codeLinesFor('pseudo', undefined, map)).toEqual([]);
    expect(codeLinesFor('cpp', undefined, map)).toEqual([]);
    expect(codeLinesFor('pseudo', 1.5, map)).toEqual([]);
    expect(codeLinesFor('pseudo', Number.NaN, map)).toEqual([]);
  });

  it('không trả mảng của bản đồ (sửa kết quả không đổi dữ liệu)', () => {
    codeLinesFor('cpp', 2, map).push(99);
    expect(codeLinesFor('cpp', 2, map)).toEqual([5, 6]);
  });
});

describe('formatCounter', () => {
  it('hiển thị 1-based', () => {
    expect(formatCounter(0, 12)).toBe('1 / 12');
    expect(formatCounter(4, 12)).toBe('5 / 12');
    expect(formatCounter(11, 12)).toBe('12 / 12');
    expect(formatCounter(0, 1)).toBe('1 / 1');
  });
});
