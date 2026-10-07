import { describe, expect, it } from 'vitest';
import { clipAssetKey } from '@/lib/clips/assets';
import { planRenders, templatePath } from '@/lib/clips/render-plan';
import type { ClipAsset, ClipModule } from '@/lib/clips/types';
import { mathClipModules } from '@/lib/subjects/math/clips';
import { fakeClip } from './_fake-clip';

const asset: ClipAsset = {
  chapters: [{ id: 'first', url: '/clips/x/first.mp4', poster: '/clips/x/first.png' }],
};
const fakeModule = (id = 'fake-clip'): ClipModule<{ a: number; b: number }> => ({
  entry: fakeClip({ id }),
  expectedDisplay: ({ a, b }) => ({ a, b }),
});

describe('planRenders', () => {
  it('plans every preset of every clip when the index is empty, in clip id then preset order', () => {
    const jobs = planRenders([fakeModule('b-clip'), fakeModule('a-clip')], {});
    expect(jobs.map((j) => `${j.clipId}/${j.presetId}`)).toEqual([
      'a-clip/p1',
      'a-clip/p2',
      'b-clip/p1',
      'b-clip/p2',
    ]);
  });

  it('skips a preset whose cache key is already in the index, and only that one', () => {
    const mod = fakeModule();
    const key = clipAssetKey(mod.entry, mod.entry.presets[0].input, 'vi-VN');
    const jobs = planRenders([mod], { [key]: asset });
    expect(jobs.map((j) => j.presetId)).toEqual(['p2']);
  });

  it('plans nothing when everything is rendered', () => {
    const mod = fakeModule();
    const index = Object.fromEntries(
      mod.entry.presets.map((p) => [clipAssetKey(mod.entry, p.input, 'en-US'), asset]),
    );
    expect(planRenders([mod], index)).toEqual([]);
  });

  it('a job carries the cache key, the template path and the numbers the scene must draw', () => {
    const [job] = planRenders([fakeModule('two-words')], {});
    expect(job.cacheKey).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(job.template).toBe('manim/templates/two_words.py');
    expect(job.expectedDisplay).toEqual({ a: 2, b: 3 });
    expect(templatePath('amgm-semicircle')).toBe('manim/templates/amgm_semicircle.py');
  });

  it('two presets with the same parameters render once', () => {
    const mod = fakeModule();
    const twin = {
      ...mod,
      entry: {
        ...mod.entry,
        presets: [mod.entry.presets[0], { ...mod.entry.presets[0], id: 'same' }],
      },
    };
    expect(planRenders([twin], {})).toHaveLength(1);
  });

  it('--only limits the plan to one clip', () => {
    expect(
      planRenders([fakeModule('a-clip'), fakeModule('b-clip')], {}, 'b-clip').map((j) => j.clipId),
    ).toEqual(['b-clip', 'b-clip']);
    expect(planRenders([fakeModule('a-clip')], {}, 'nope')).toEqual([]);
  });

  it('is deterministic and independent of the order of the modules', () => {
    const a = planRenders([fakeModule('a-clip'), fakeModule('b-clip')], {});
    const b = planRenders([fakeModule('b-clip'), fakeModule('a-clip')], {});
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the real math clips: every preset of every clip has a distinct key and 84 jobs are planned', () => {
    const jobs = planRenders(mathClipModules, {});
    expect(new Set(jobs.map((j) => j.cacheKey)).size).toBe(jobs.length);
    expect(jobs.length).toBe(mathClipModules.reduce((n, m) => n + m.entry.presets.length, 0));
    expect(jobs.length).toBeGreaterThanOrEqual(21 * 3);
    for (const j of jobs) {
      expect(j.template).toMatch(/^manim\/templates\/[a-z0-9_]+\.py$/);
      expect(Object.keys(j.expectedDisplay).length).toBeGreaterThan(0);
    }
  });
});
