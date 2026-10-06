import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURRICULUM_OUT, CURRICULUM_SRC, splitCurriculum } from '@/scripts/split-curriculum';

const root = process.cwd();
const srcText = readFileSync(join(root, CURRICULUM_SRC), 'utf8');
const readOut = (name: string) => readFileSync(join(root, CURRICULUM_OUT, name), 'utf8');

type Topic = {
  id: string;
  tracks: string[];
  difficulty: number;
  name_vi: string;
  name_en: string;
  prerequisites: string[];
};
type Index = {
  topics: (Omit<Topic, 'tracks'> & { tier: number; tracks: string[] })[];
  sequencing: Record<string, string[] | string>;
  course_shape: unknown;
  tracks_def: unknown;
};

const index = JSON.parse(readOut('index.json')) as Index;
const tiers = [1, 2, 3, 4].map(
  (n) => JSON.parse(readOut(`tier-${n}.json`)) as { order: number; topics: Topic[] },
);
const tierOf = new Map(index.topics.map((t) => [t.id, t.tier]));

describe('curriculum split (DATA-MODEL §5)', () => {
  it('topic ids are unique and every topic has tracks', () => {
    expect(tierOf.size).toBe(index.topics.length);
    for (const t of index.topics) expect(t.tracks.length, t.id).toBeGreaterThan(0);
  });

  it('prerequisites exist, are acyclic and never point to a higher tier', () => {
    for (const t of index.topics) {
      for (const p of t.prerequisites) {
        expect(tierOf.has(p), `${t.id} -> ${p}`).toBe(true);
        expect(tierOf.get(p)!, `${t.id} -> ${p}`).toBeLessThanOrEqual(t.tier);
      }
    }
    const state = new Map<string, 1 | 2>(); // 1 = visiting, 2 = done
    const prereqs = new Map(index.topics.map((t) => [t.id, t.prerequisites]));
    const visit = (id: string) => {
      expect(state.get(id), `cycle through ${id}`).not.toBe(1);
      if (state.get(id) === 2) return;
      state.set(id, 1);
      for (const p of prereqs.get(id)!) visit(p);
      state.set(id, 2);
    };
    for (const id of prereqs.keys()) visit(id);
  });

  it('sequencing lists all 32 topics exactly once', () => {
    const listed = Object.values(index.sequencing).filter(Array.isArray).flat() as string[];
    expect(index.topics).toHaveLength(32);
    expect([...listed].sort()).toEqual([...tierOf.keys()].sort());
  });

  it('index.json matches the tier-N.json files', () => {
    const fromTiers = tiers.flatMap((tier) =>
      tier.topics.map((t) => ({
        id: t.id,
        name_vi: t.name_vi,
        name_en: t.name_en,
        tier: tier.order,
        tracks: t.tracks,
        difficulty: t.difficulty,
        prerequisites: t.prerequisites,
      })),
    );
    expect(index.topics).toEqual(fromTiers);
  });

  it('committed files equal a fresh split of the source (run: pnpm exec tsx scripts/split-curriculum.ts)', async () => {
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
