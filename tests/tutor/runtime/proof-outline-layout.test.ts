import { describe, expect, it } from 'vitest';
import {
  MAX_DEPTH,
  MAX_NODES,
  MAX_TEXT,
  describeProof,
  proofRows,
} from '@/lib/tutor/runtime/visualizers/proof-outline';

const n = (id: string, kind: string, text: string, parent?: string, status?: string) => ({
  id,
  kind,
  text,
  ...(parent ? { parent } : {}),
  ...(status ? { status } : {}),
});

describe('proofRows', () => {
  it('orders roots in list order with each child right after its parent, and indents by depth', () => {
    const rows = proofRows([
      n('g', 'given', 'a > 0'),
      n('t', 'goal', 'a + 1/a ≥ 2'),
      n('h1', 'have', 'step 1', 'g'),
      n('b1', 'because', 'AM-GM', 'h1'),
      n('h2', 'have', 'step 2', 'g'),
    ]);
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ['g', 0],
      ['h1', 1],
      ['b1', 2],
      ['h2', 1],
      ['t', 0],
    ]);
  });

  it('a parent that is unknown, later in the list, or the node itself makes the node a root (no cycles)', () => {
    const rows = proofRows([
      n('a', 'have', 'x', 'b'), // b comes later
      n('b', 'have', 'y', 'b'), // itself
      n('c', 'have', 'z', 'nope'),
    ]);
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ['a', 0],
      ['b', 0],
      ['c', 0],
    ]);
  });

  it('skips bad nodes: not an object, empty or duplicate id, text not a string', () => {
    const rows = proofRows([
      n('a', 'have', 'ok'),
      7,
      null,
      { id: '', kind: 'have', text: 'x' },
      { id: 'b', kind: 'have' },
      n('a', 'have', 'dup'),
      { id: 7, kind: 'have', text: 'x' },
    ]);
    expect(rows.map((r) => r.text)).toEqual(['ok']);
    expect(proofRows('x')).toEqual([]);
  });

  it('an unknown kind becomes "have"; an unknown status is dropped', () => {
    const [r] = proofRows([n('a', 'weird', 'x', undefined, 'maybe')]);
    expect(r.kind).toBe('have');
    expect(r.status).toBeNull();
    expect(proofRows([n('b', 'goal', 'x', undefined, 'done')])[0].status).toBe('done');
  });

  it('caps depth, node count and text length', () => {
    let prev: string | undefined;
    const chain = Array.from({ length: 10 }, (_, i) => {
      const node = n(`c${i}`, 'have', `s${i}`, prev);
      prev = `c${i}`;
      return node;
    });
    expect(Math.max(...proofRows(chain).map((r) => r.depth))).toBe(MAX_DEPTH);
    const many = Array.from({ length: 100 }, (_, i) => n(`m${i}`, 'have', 'x'));
    expect(proofRows(many)).toHaveLength(MAX_NODES);
    const [long] = proofRows([n('l', 'have', 'x'.repeat(1000))]);
    expect(Array.from(long.text)).toHaveLength(MAX_TEXT);
    expect(long.text.endsWith('…')).toBe(true);
  });
});

describe('describeProof', () => {
  it('lists kind, highlight kind and text, indented, with the localized kind label', () => {
    const rows = proofRows([n('g', 'given', 'a > 0'), n('h', 'have', 'x', 'g')]);
    expect(describeProof(rows, { h: 'active', g: 'bogus' }, (k) => k.toUpperCase())).toBe(
      'GIVEN: a > 0;   HAVE (active): x',
    );
  });
});
