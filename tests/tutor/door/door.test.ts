import { describe, expect, it } from 'vitest';

import { unresolved } from '@/lib/tutor/catalog/messages';
import { buildDoorCatalog, sequenceOf, type CurriculumTopic } from '@/lib/tutor/door/catalog';
import { buildLesson, cleanNickname, type LessonDeps } from '@/lib/tutor/door/lesson';
import { PRACTICE_COUNT, buildPractice } from '@/lib/tutor/door/practice';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { walkthroughProvider, widgetRegistry } from '@/lib/widgets';
import cpIndex from '@/skills/agent-runtime/competitive-programming/references/curriculum/index.json';
import mathIndex from '@/skills/agent-runtime/olympiad-math/references/curriculum/index.json';

const entries = SUBJECT_PACKS.flatMap((p) => p.walkthroughs);
const topics = [...cpIndex.topics, ...mathIndex.topics] as CurriculumTopic[];

describe('door catalog', () => {
  const items = buildDoorCatalog(entries, topics);

  it('lists every entry once and places it in the curriculum', () => {
    expect(items.map((i) => i.id).sort()).toEqual(entries.map((e) => e.id).sort());
    expect(items.filter((i) => i.tier === 99).map((i) => i.id)).toEqual([]);
  });

  it('orders by subject, then tier, then difficulty', () => {
    const key = (i: (typeof items)[number]) => [i.subject, i.tier, i.difficulty];
    for (let k = 1; k < items.length; k++) {
      const [a, b] = [key(items[k - 1]), key(items[k])];
      expect(
        a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] <= b[2]))),
      ).toBe(true);
    }
  });
});

describe('curriculum order', () => {
  it('reads the numbered keys of `sequencing` in numeric order', () => {
    expect(sequenceOf({ grade_10: ['c'], grade_8: ['a'], grade_9: ['b'], note: 'text' })).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(sequenceOf({ tier_2: ['y'], tier_1: ['x'] })).toEqual(['x', 'y']);
  });

  it('sorts a tier by that order, then difficulty', () => {
    const sequence = [...sequenceOf(cpIndex.sequencing), ...sequenceOf(mathIndex.sequencing)];
    const items = buildDoorCatalog(entries, topics, sequence);
    const tier2 = items.filter((i) => i.subject === 'cp' && i.tier === 2);
    for (let k = 1; k < tier2.length; k++)
      expect(tier2[k - 1].order).toBeLessThanOrEqual(tier2[k].order);
    expect(items.every((i) => i.order < 9999)).toBe(true);
  });
});

describe('practice', () => {
  it('is available for nearly every entry', () => {
    const items = buildDoorCatalog(entries, topics);
    expect(items.filter((i) => i.practice).length).toBeGreaterThanOrEqual(entries.length * 0.9);
  });

  it.each(entries.map((e) => [e.id, e] as const))('%s: keyed, bounded, readable', (_id, entry) => {
    for (const locale of ['vi-VN', 'en-US']) {
      const qs = buildPractice(entry, { locale });
      expect(qs.length).toBeLessThanOrEqual(PRACTICE_COUNT);
      expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
      for (const q of qs) {
        expect(q.options!.length).toBeGreaterThanOrEqual(2);
        expect(q.options!.map((o) => o.value)).toContain(q.answer![0]);
        expect(q.answer).toHaveLength(1);
        expect(unresolved(q.question)).toEqual([]);
        expect(unresolved(q.analysis ?? '')).toEqual([]);
        expect(q.id.startsWith(`${entry.id}:`)).toBe(true);
      }
    }
  });

  it('is deterministic for a seed and varies with it on a long entry', () => {
    const e = entries.find((x) => x.id === 'binary-search')!;
    const a = buildPractice(e, { locale: 'vi-VN', seed: 7, count: 3 });
    expect(buildPractice(e, { locale: 'vi-VN', seed: 7, count: 3 })).toEqual(a);
    const seeds = new Set(
      [1, 2, 3, 4, 5, 6].map((s) =>
        buildPractice(e, { locale: 'vi-VN', seed: s, count: 3 })
          .map((q) => q.id)
          .join(),
      ),
    );
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('takes the correct option from the entry itself', () => {
    const e = entries.find((x) => x.id === 'binary-search')!;
    const mid = e.beatDefs.find((d) => d.id === 'mid')!.ask!.predict!;
    const qs = buildPractice(e, { locale: 'vi-VN', count: 100 }).filter((q) =>
      q.id.endsWith(':mid:1'),
    );
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      const picked = q.options!.find((o) => o.value === q.answer![0])!.label;
      expect(mid.options.map((o) => o['vi-VN'])).toContain(picked);
    }
  });
});

describe('lesson', () => {
  let n = 0;
  const deps: LessonDeps = {
    findWalkthrough: (id) => widgetRegistry.findWalkthrough(id),
    provider: walkthroughProvider,
    codeAllowed: false,
    now: () => 1_700_000_000_000,
    token: () => `t${++n}`,
  };
  const base = { walkthroughId: 'binary-search', locale: 'vi-VN', mode: 'lesson' } as const;

  it('builds a walkthrough page followed by a practice quiz', () => {
    const r = buildLesson({ ...base, nickname: 'Minh' }, deps);
    if (!r.ok) throw new Error(r.message);
    const doc = r.document;
    expect(doc.stage.id).toBe(r.stageId);
    expect(doc.stage.description).toBe('Học sinh: Minh');
    expect(doc.scenes.map((s) => [s.type, s.order])).toEqual([
      ['interactive', 1],
      ['quiz', 2],
    ]);
    expect(doc.scenes.every((s) => s.stageId === r.stageId)).toBe(true);
    expect(doc.outline).toMatchObject({ generationComplete: true, producer: 'server-job' });
    expect(doc.stage.agentIds).toEqual(['default-1']);
    const wt = doc.scenes[0];
    expect(wt.content).toMatchObject({
      type: 'interactive',
      widgetConfig: { kind: 'walkthrough' },
    });
    expect((wt.actions ?? []).length).toBeGreaterThan(0);
  });

  it('practice-only mode keeps just the quiz', () => {
    const r = buildLesson({ ...base, mode: 'practice' }, deps);
    if (!r.ok) throw new Error(r.message);
    expect(r.document.scenes.map((s) => s.type)).toEqual(['quiz']);
    expect(r.document.stage.name.startsWith('Luyện tập')).toBe(true);
  });

  it('refuses an unknown walkthrough or preset', () => {
    expect(buildLesson({ ...base, walkthroughId: 'nope' }, deps)).toMatchObject({
      ok: false,
      error: 'unknown-walkthrough',
    });
    expect(buildLesson({ ...base, presetId: 'nope' }, deps)).toMatchObject({
      ok: false,
      error: 'unknown-preset',
    });
  });

  it('cleans nicknames', () => {
    expect(cleanNickname('  Minh \n\t An  ')).toBe('Minh An');
    expect(cleanNickname('x'.repeat(100))).toHaveLength(40);
    expect(cleanNickname('   ')).toBeUndefined();
    expect(cleanNickname(42)).toBeUndefined();
  });
});
