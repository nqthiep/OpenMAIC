import { describe, expect, it } from 'vitest';
import { binarySearchEntry } from '@/lib/subjects/cp/catalog/binary-search';
import { MAX_NARRATED_BEATS } from '@/lib/tutor/provider';
import {
  buildTranscript,
  degrade,
  describeFrame,
  renderTranscript,
  type TranscriptLine,
} from '@/eval/sim-learner/transcript';

// Pure: no model, no network.

const lines = (n: number): TranscriptLine[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: i % 3 === 0 ? 'ask' : 'narration',
    text: `t${i}`,
    frame: `f${i}`,
  }));

describe('buildTranscript', () => {
  const t = buildTranscript(binarySearchEntry, 'absent', 'vi-VN');

  it('pairs every teacher line with a frame description, narration with vars filled', () => {
    expect(t.length).toBeGreaterThan(0);
    for (const l of t) {
      expect(l.text).not.toMatch(/\{[a-z]+\}/i);
      expect(l.frame).toMatch(/^Khung hình \d+\/\d+: /);
    }
    expect(t[0]).toMatchObject({ kind: 'narration' });
    expect(t[0].text).toContain('45'); // target of preset "absent"
    expect(t[0].frame).toContain('vars: lo=0, hi=9, target=45');
    expect(t[0].frame).toContain('highlights: active [0-9]');
  });

  it('puts an ask before its narration, on the same frame', () => {
    const i = t.findIndex((l) => l.kind === 'ask');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(t[i + 1].kind).toBe('narration');
    expect(t[i + 1].frame).toBe(t[i].frame);
  });

  it('has one narration per narrated beat and one ask per predict beat', () => {
    const narrations = t.filter((l) => l.kind === 'narration').length;
    expect(narrations).toBeLessThanOrEqual(MAX_NARRATED_BEATS);
    expect(narrations).toBe(10); // preset "absent": start + 4 x (mid, move) + done
    expect(t.filter((l) => l.kind === 'ask')).toHaveLength(4);
  });

  it('is deterministic, and follows the locale', () => {
    expect(buildTranscript(binarySearchEntry, 'absent', 'vi-VN')).toEqual(t);
    const en = buildTranscript(binarySearchEntry, 'absent', 'en-US');
    expect(en[0].text).toContain('sorted');
    expect(en[0].frame).toMatch(/^Frame 1\//);
  });

  it('rejects an unknown preset', () => {
    expect(() => buildTranscript(binarySearchEntry, 'nope', 'vi-VN')).toThrow(/unknown presetId/);
  });

  it('renders numbered lines with the screen description', () => {
    const text = renderTranscript(t);
    expect(text).toContain('1. Teacher says: ');
    expect(text).toContain('Teacher asks: ');
    expect(text).toContain('   On screen: Khung hình 1/');
  });
});

describe('describeFrame', () => {
  it('compresses highlight runs and omits empty parts', () => {
    const s = describeFrame(
      {
        state: {},
        meta: {
          index: 2,
          explanation: 'x',
          highlights: { 0: 'muted', 1: 'muted', 2: 'muted', 4: 'active' },
        },
      },
      9,
      'en-US',
    );
    expect(s).toBe('Frame 3/9: x | highlights: muted [0-2]; active [4]');
  });
});

describe('degrade', () => {
  const good = lines(14);

  it('is deterministic for a seed and differs across seeds', () => {
    expect(degrade(good, 1)).toEqual(degrade(good, 1));
    expect(degrade(good, 1)).not.toEqual(degrade(good, 2));
  });

  it('drops half the steps, reorders the rest and removes every frame description', () => {
    const bad = degrade(good, 1);
    expect(bad).toHaveLength(7);
    for (const l of bad) {
      expect(l.frame).toBe('');
      expect(good).toContainEqual({ ...l, frame: expect.any(String) });
    }
    expect(new Set(bad.map((l) => l.text)).size).toBe(bad.length);
    expect(bad.map((l) => l.text)).not.toEqual(good.slice(0, 7).map((l) => l.text));
  });

  it('renders a degraded line without an "On screen" line', () => {
    const text = renderTranscript(degrade(good, 1));
    expect(text).not.toContain('On screen');
    expect(renderTranscript(good)).toContain('On screen: f0');
  });

  it('keeps at least one line and does not mutate the input', () => {
    const copy = structuredClone(good);
    expect(degrade(lines(1), 3)).toHaveLength(1);
    expect(degrade([], 3)).toEqual([]);
    degrade(good, 9);
    expect(good).toEqual(copy);
  });
});
