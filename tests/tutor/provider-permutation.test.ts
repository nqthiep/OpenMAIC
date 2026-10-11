import type { InteractiveContent, Scene } from '@openmaic/dsl';
import { describe, expect, it } from 'vitest';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { msg } from '@/lib/tutor/catalog/messages';
import { presetFrames } from '@/lib/tutor/engine/preset-frames';
import { createWalkthroughProvider, getTutorLabels, RUNTIME_VERSION } from '@/lib/tutor/provider';
import type { BeatRef, WalkthroughData } from '@/lib/tutor/protocol/widget-data';
import { resolvePredict } from '@/lib/tutor/runtime/predict';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';

// Predict options are shown in a per-occurrence order (`order`); see provider.ts buildPresets.
const LOCALES = ['vi-VN', 'en-US'] as const;
const entries = SUBJECT_PACKS.flatMap((pack) => [...pack.walkthroughs]);
const withPredict = entries.filter((e) => e.beatDefs.some((d) => d.ask?.predict));
const provider = createWalkthroughProvider({
  findWalkthrough: (id) => entries.find((e) => e.id === id),
  getLabels: getTutorLabels,
});

function buildOf(entry: AnyWalkthroughEntry, locale: string) {
  const presetId = entry.presets[0].id;
  return provider.build({ id: entry.id, presetId }, { locale });
}

/** The `walkthrough-data` block of a built widget; it holds the sets of every preset. */
function dataOf(entry: AnyWalkthroughEntry, locale: string): WalkthroughData {
  const html = (buildOf(entry, locale).content as InteractiveContent).html as string;
  const hit = html.match(
    /<script type="application\/json" id="walkthrough-data">([\s\S]*?)<\/script>/,
  );
  expect(hit, `${entry.id} walkthrough-data`).not.toBeNull();
  return JSON.parse(hit![1]) as WalkthroughData;
}

describe('predict option order', () => {
  for (const locale of LOCALES) {
    it.each(withPredict.map((e) => [e.id, e] as const))(
      `%s (${locale}): deterministic, and the shown answer is the catalog answer`,
      (_id, entry) => {
        const data = dataOf(entry, locale);
        const again = dataOf(entry, locale);
        expect(again.sets).toEqual(data.sets);

        const text = (id: string) => data.beatText[id].options!;
        for (const preset of entry.presets) {
          const frames = presetFrames(entry, preset, locale).frames;
          for (const ref of data.sets[preset.id].beats) {
            const predict = entry.beatDefs.find((d) => d.id === ref.id)?.ask?.predict;
            if (!predict) continue;
            const order = ref.order ?? [];
            const original = predict.answer(frames[ref.frame], frames[ref.frame + 1]);
            expect(text(ref.id), `${ref.id} options`).toEqual(
              predict.options.map((o) => msg(o, locale)),
            );
            expect(
              [...order].sort((x, y) => x - y),
              `${ref.id} order`,
            ).toEqual(predict.options.map((_, k) => k));
            expect(order[ref.answer!], `${preset.id} ${ref.id} answer`).toBe(original);
            expect(order.map((j) => text(ref.id)[j])[ref.answer!]).toBe(text(ref.id)[original]);
          }
        }
      },
      60_000,
    );
  }

  it('leaves no answer position fixed for a question with three or more occurrences', () => {
    // Questions with one or two occurrences are below the threshold and are not checked here.
    for (const locale of LOCALES) {
      const positions = new Map<string, number[]>();
      for (const entry of withPredict) {
        const data = dataOf(entry, locale);
        for (const set of Object.values(data.sets)) {
          for (const ref of set.beats) {
            if (ref.answer === undefined) continue;
            const key = `${entry.id}#${ref.id}`;
            positions.set(key, [...(positions.get(key) ?? []), ref.answer]);
          }
        }
      }
      for (const [key, pos] of positions) {
        if (pos.length >= 3) expect(new Set(pos).size, `${locale} ${key}`).toBeGreaterThan(1);
      }
    }
  });

  it('leaves no answer position fixed within one preset', () => {
    for (const locale of LOCALES) {
      for (const entry of withPredict) {
        const data = dataOf(entry, locale);
        for (const [presetId, set] of Object.entries(data.sets)) {
          const perBeat = new Map<string, number[]>();
          for (const ref of set.beats) {
            if (ref.answer === undefined) continue;
            perBeat.set(ref.id, [...(perBeat.get(ref.id) ?? []), ref.answer]);
          }
          for (const [id, pos] of perBeat) {
            if (pos.length >= 2) {
              expect(new Set(pos).size, `${locale} ${entry.id}/${presetId} ${id}`).toBeGreaterThan(
                1,
              );
            }
          }
        }
      }
    }
  });

  it('keeps order and answer out of widgetConfig (they live in sets only)', () => {
    const config = (buildOf(withPredict[0], 'vi-VN').content as InteractiveContent).widgetConfig;
    expect(JSON.stringify(config)).not.toMatch(/"(order|answer)"/);
  });
});

describe('resolvePredict with order', () => {
  const text: WalkthroughData['beatText'] = {
    mid: { label: 'Mid', ask: 'Which?', options: ['lo', 'hi', 'none'] },
  };
  const base: BeatRef = { id: 'mid', occurrence: 1, frame: 2, answer: 0 };

  it('keeps the catalog order and the answer when order is absent', () => {
    const beats: BeatRef[] = [{ ...base, answer: 1 }];
    expect(resolvePredict('mid', beats, 2, text)).toEqual({
      beatId: 'mid',
      ask: 'Which?',
      options: ['lo', 'hi', 'none'],
      answer: 1,
    });
  });

  it('shows the options in order and grades by the shown position', () => {
    // Position 0 shows the original option 2 ('none'), 1 shows 'lo', 2 shows 'hi' (original answer 1).
    const beats: BeatRef[] = [{ ...base, answer: 2, order: [2, 0, 1] }];
    expect(resolvePredict('mid', beats, 2, text)).toEqual({
      beatId: 'mid',
      ask: 'Which?',
      options: ['none', 'lo', 'hi'],
      answer: 2,
    });
  });

  it('returns null when order is not a permutation of the options', () => {
    const bad = [
      [0, 1],
      [0, 0, 1],
      [0, 1, 3],
      [0, 1, 2, 3],
      ['0', 1, 2],
    ] as unknown as number[][];
    for (const order of bad) {
      expect(resolvePredict('mid', [{ ...base, order }], 2, text)).toBeNull();
    }
  });
});

describe('isStale and RUNTIME_VERSION', () => {
  const entry = entries.find((e) => e.id === 'binary-search')!;
  const sceneAt = (version: unknown): Scene => {
    const content = buildOf(entry, 'vi-VN').content as InteractiveContent;
    const widgetConfig = { ...content.widgetConfig, runtimeVersion: version };
    return {
      id: 'sc1',
      stageId: 'st1',
      type: 'interactive',
      content: { ...content, widgetConfig },
    } as unknown as Scene;
  };

  it('is stale for any runtimeVersion other than the current one', () => {
    expect(provider.isStale(sceneAt(RUNTIME_VERSION))).toBe(false);
    expect(provider.isStale(sceneAt(RUNTIME_VERSION - 1))).toBe(true);
    expect(provider.isStale(sceneAt(undefined))).toBe(true);
  });
});
