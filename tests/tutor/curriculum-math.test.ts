import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MATH_CURRICULUM_OUT,
  MATH_CURRICULUM_SRC,
  splitCurriculum,
} from '@/scripts/split-curriculum-math';
import { mathClipModules } from '@/lib/subjects/math/clips';
import { mathPack } from '@/lib/subjects/math/pack';

const root = process.cwd();
const srcText = readFileSync(join(root, MATH_CURRICULUM_SRC), 'utf8');
const readOut = (name: string) => readFileSync(join(root, MATH_CURRICULUM_OUT, name), 'utf8');

type Topic = {
  id: string;
  difficulty: number;
  name_vi: string;
  name_en: string;
  prerequisites: string[];
  primary_medium: string;
  clip_ids: string[];
  walkthrough_ids: string[];
  vn_sources: string[];
  exam_relevance: string;
};
type Index = {
  topics: (Omit<Topic, 'clip_ids' | 'walkthrough_ids' | 'vn_sources' | 'exam_relevance'> & {
    tier: number;
  })[];
  sequencing: Record<string, string[] | string>;
};

const index = JSON.parse(readOut('index.json')) as Index;
const tiers = [1, 2, 3, 4].map(
  (n) => JSON.parse(readOut(`tier-${n}.json`)) as { order: number; topics: Topic[] },
);
const all = tiers.flatMap((t) => t.topics.map((x) => ({ ...x, tier: t.order })));
const byId = new Map(all.map((t) => [t.id, t]));

describe('math curriculum (card 3-R1 / 3B-00)', () => {
  it('has the 28 topics of SCHEMA §7, 7 per tier, with ids m<tier>-<name>', () => {
    expect(all).toHaveLength(28);
    for (const t of tiers) expect(t.topics, `tier ${t.order}`).toHaveLength(7);
    for (const t of all) expect(t.id).toMatch(new RegExp(`^m${t.tier}-[a-z-]+$`));
    expect(byId.size).toBe(28);
  });

  it('the media split is the one SCHEMA §7 counts: 17 manim, 10 slide, 1 walkthrough', () => {
    const count = (m: string) => all.filter((t) => t.primary_medium === m).length;
    expect([count('manim'), count('slide'), count('walkthrough')]).toEqual([17, 10, 1]);
  });

  it('prerequisites exist, are acyclic and never point to a higher tier', () => {
    for (const t of all)
      for (const p of t.prerequisites) {
        expect(byId.has(p), `${t.id} -> ${p}`).toBe(true);
        expect(byId.get(p)!.tier, `${t.id} -> ${p}`).toBeLessThanOrEqual(t.tier);
      }
    const state = new Map<string, 1 | 2>();
    const visit = (id: string) => {
      expect(state.get(id), `cycle through ${id}`).not.toBe(1);
      if (state.get(id) === 2) return;
      state.set(id, 1);
      for (const p of byId.get(id)!.prerequisites) visit(p);
      state.set(id, 2);
    };
    for (const id of byId.keys()) visit(id);
  });

  it('every clip and walkthrough of the math pack names a topic of the curriculum, and the curriculum lists it back', () => {
    const entries = [
      ...mathClipModules.map((m) => ({
        id: m.entry.id,
        topics: m.entry.curriculumTopics,
        key: 'clip_ids' as const,
      })),
      ...mathPack.walkthroughs.map((w) => ({
        id: w.id,
        topics: w.curriculumTopics,
        key: 'walkthrough_ids' as const,
      })),
    ];
    expect(entries.length).toBeGreaterThanOrEqual(24);
    for (const e of entries)
      for (const topic of e.topics) {
        expect(byId.has(topic), `${e.id} -> ${topic}`).toBe(true);
        expect(byId.get(topic)![e.key], `${topic} lists ${e.id}`).toContain(e.id);
      }
    for (const t of all) {
      for (const id of t.clip_ids)
        expect(
          mathClipModules.some((m) => m.entry.id === id),
          id,
        ).toBe(true);
      for (const id of t.walkthrough_ids)
        expect(
          mathPack.walkthroughs.some((w) => w.id === id),
          id,
        ).toBe(true);
    }
  });

  it('claims no source: vn_sources is empty and exam relevance is marked [Unverified]', () => {
    for (const t of all) {
      expect(t.vn_sources, t.id).toEqual([]);
      expect(t.exam_relevance, t.id).toContain('[Unverified]');
    }
  });

  it('sequencing lists every topic exactly once, and index.json matches the tier files', () => {
    const listed = Object.values(index.sequencing).filter(Array.isArray).flat() as string[];
    expect([...listed].sort()).toEqual([...byId.keys()].sort());
    expect(index.topics).toEqual(
      all.map((t) => ({
        id: t.id,
        name_vi: t.name_vi,
        name_en: t.name_en,
        tier: t.tier,
        primary_medium: t.primary_medium,
        difficulty: t.difficulty,
        prerequisites: t.prerequisites,
      })),
    );
  });

  it('committed files equal a fresh split of the source (run: pnpm exec tsx scripts/split-curriculum-math.ts)', async () => {
    const fresh = await splitCurriculum(srcText);
    expect(Object.keys(fresh).sort()).toEqual([
      'index.json',
      'tier-1.json',
      'tier-2.json',
      'tier-3.json',
      'tier-4.json',
    ]);
    for (const [name, content] of Object.entries(fresh)) expect(readOut(name), name).toBe(content);
  });
});
