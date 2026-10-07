import type { AnyClipEntry, ClipEntry } from '@/lib/clips/types';

const m = (vi: string, en: string) => ({ 'vi-VN': vi, 'en-US': en });

export interface FakeIn {
  a: number;
  b: number;
}

/** A small clip with two chapters; `built` toggles whether its asset exists. */
export function fakeClip(
  opts: { id?: string; built?: boolean; chapterAsk?: boolean } = {},
): ClipEntry<FakeIn> {
  const id = opts.id ?? 'fake-clip';
  const built = opts.built ?? true;
  return {
    id,
    kind: 'prebuilt',
    curriculumTopics: ['t-fake'],
    title: m('Clip thử', 'Test clip'),
    inputSpec: {
      kind: 'record',
      fields: {
        a: { kind: 'number', range: [1, 9], step: 1 },
        b: { kind: 'number', range: [1, 9], step: 1 },
      },
    },
    presets: [
      { id: 'p1', label: m('Một', 'One'), input: { a: 2, b: 3 } },
      { id: 'p2', label: m('Hai', 'Two'), input: { a: 4, b: 1 } },
    ],
    engine: { name: 'manim-ce', version: '0.21.0', templateRev: 1 },
    render: { w: 1280, h: 720, fps: 30 },
    silent: true,
    chapters: [
      {
        id: 'first',
        startSec: 0,
        endSec: 10,
        label: m('Chương một', 'Chapter one'),
        before: m('Xem hình đầu.', 'Look at the first picture.'),
        after: m('Đó là bước một.', 'That was step one.'),
        caption: m('Chú thích <b>', 'Caption <b>'),
        ...(opts.chapterAsk ? { ask: m('Em thấy gì?', 'What do you see?') } : {}),
      },
      {
        id: 'second',
        startSec: 10,
        endSec: 20,
        label: m('Chương hai', 'Chapter two'),
        before: m('', ''),
        after: m('Xong.', 'Done.'),
      },
    ],
    invariants: (i) => i.a > 0 && i.b > 0,
    bakedText: false,
    cacheKeyInput: (i, locale) => [i.a, i.b, locale],
    asset: (i) =>
      built
        ? {
            chapters: [
              {
                id: 'first',
                url: `/clips/${i.a}-${i.b}/first.mp4`,
                poster: `/clips/${i.a}-${i.b}/first.png`,
              },
              {
                id: 'second',
                url: `/clips/${i.a}-${i.b}/second.mp4`,
                poster: `/clips/${i.a}-${i.b}/second.png`,
              },
            ],
          }
        : null,
    sheet: {
      chapters: [
        {
          id: 'first',
          shows: m('hình vuông cạnh a', 'a square of side a'),
          formulas: ['a^2'],
          misconceptions: [m('a^2 = 2a', 'a^2 = 2a')],
          hints: [m('h1', 'h1'), m('h2', 'h2'), m('h3', 'h3')],
        },
        {
          id: 'second',
          shows: m('hình chữ nhật', 'a rectangle'),
          formulas: [],
          misconceptions: [],
          hints: [m('h1', 'h1'), m('h2', 'h2'), m('h3', 'h3')],
        },
      ],
    },
  };
}

export const fakeAny = (opts?: Parameters<typeof fakeClip>[0]): AnyClipEntry => fakeClip(opts);
