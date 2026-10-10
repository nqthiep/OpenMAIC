import { describe, expect, it } from 'vitest';

import { hasStateReader, readState } from '@/lib/tutor/door/state-text';

describe('readState', () => {
  it('writes an array out', () => {
    expect(readState('array', { values: [3, 1, 4] }, 'vi-VN')).toEqual(['a = [3, 1, 4]']);
    expect(readState('array', { values: [{}] }, 'vi-VN')).toBeNull();
    // letters, and the labelled rows under the array (pattern, failure function)
    expect(
      readState(
        'array',
        { values: ['a', 'b'], rows: [{ label: 'mẫu', values: ['b', null], offset: 1 }] },
        'vi-VN',
      ),
    ).toEqual(['a = [a, b]', 'mẫu @1: [b, ·]']);
  });

  it('writes a DP table out with its labels, empty cells as a dot', () => {
    const lines = readState(
      'grid',
      {
        rows: 2,
        cols: 3,
        cells: [
          [0, 0, 0],
          [0, 15, ''],
        ],
        rowLabels: ['0', '1:1/15'],
        colLabels: ['0', '1', '2'],
      },
      'vi-VN',
    );
    expect(lines).toEqual(['Bảng:', '· | 0 | 1 | 2', '0 | 0 | 0 | 0', '1:1/15 | 0 | 15 | ·']);
  });

  it('writes a graph out with weights and direction', () => {
    const lines = readState(
      'graph',
      {
        nodes: [
          { id: 'A', label: 'A (0)' },
          { id: 'B', label: 'B' },
        ],
        edges: [{ from: 'A', to: 'B', weight: 7, directed: true }],
      },
      'en-US',
    );
    expect(lines).toEqual(['Nodes: A (0), B', 'Edges: A→B (7)']);
  });

  it('writes a tree out with parent and note', () => {
    const lines = readState(
      'tree',
      {
        nodes: [
          { id: '1', label: '[0,3]', note: '11' },
          { id: '2', label: '[0,1]', parent: '1' },
        ],
      },
      'vi-VN',
    );
    expect(lines).toEqual(['1: [0,3] = 11', '2: [0,1] (cha 1)']);
  });

  it('refuses what it cannot read or what is too large', () => {
    expect(readState('geometry', { points: [] }, 'vi-VN')).toBeNull();
    expect(readState('grid', { cells: 'no' }, 'vi-VN')).toBeNull();
    const big = {
      nodes: Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, label: 'x'.repeat(40) })),
      edges: [],
    };
    expect(readState('graph', big, 'vi-VN')).toBeNull();
    expect(hasStateReader('graph')).toBe(true);
    expect(hasStateReader('geometry')).toBe(false);
  });
});
