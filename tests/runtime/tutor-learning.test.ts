import { describe, expect, it } from 'vitest';

import { APP_RUNTIME_PAYLOAD_VALIDATORS } from '@/lib/runtime/payload-validators';

const v = APP_RUNTIME_PAYLOAD_VALIDATORS.tutorLearning;
const ok = (p: unknown) => v(p).valid;

const beat = {
  type: 'beat',
  sceneId: 's1',
  walkthroughId: 'binary-search',
  entryRev: 3,
  preset: 'absent',
  beatId: 'mid',
  occurrence: 2,
  at: '2026-10-01T09:00:00Z',
};

describe('tutorLearning validator', () => {
  it('accepts the five record types', () => {
    expect(ok(beat)).toBe(true);
    expect(
      ok({ type: 'prediction', sceneId: 's', beatId: 'm', correct: false, skipped: false }),
    ).toBe(true);
    expect(ok({ type: 'hint', sceneId: 's', beatId: 'm', level: 2 })).toBe(true);
    expect(ok({ type: 'rating', stageId: 'st', easy: 4 })).toBe(true);
    expect(ok({ type: 'moderation', direction: 'out', categories: ['personal-data'] })).toBe(true);
  });

  it('rejects unknown keys, unknown type, bad shapes', () => {
    expect(ok({ ...beat, extra: 1 })).toBe(false);
    expect(ok({ type: 'nope' })).toBe(false);
    expect(ok(null)).toBe(false);
    expect(ok([])).toBe(false);
    expect(ok({ ...beat, entryRev: 1.5 })).toBe(false);
    expect(ok({ type: 'hint', sceneId: 's', beatId: 'm' })).toBe(false);
  });

  it('moderation carries no text field', () => {
    const m = { type: 'moderation', direction: 'in', categories: ['hate'] };
    expect(ok(m)).toBe(true);
    expect(ok({ ...m, text: 'raw' })).toBe(false);
    expect(ok({ ...m, categories: ['free text'] })).toBe(false);
    expect(ok({ ...m, direction: 'sideways' })).toBe(false);
  });

  it('rejects records over 2 KB', () => {
    expect(ok({ ...beat, sceneId: 'x'.repeat(3000) })).toBe(false);
  });
});
