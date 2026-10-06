/**
 * Known-good variants for the clean side of the review-panel calibration (ADR 0014 decision 7).
 *
 * The catalog has few entries, so the clean set is the real entries plus deterministic,
 * semantics-preserving rewrites of their DATA: a hint or narration reworded from a small fixed
 * phrase table, a label renamed, pitfalls / misconceptions / presets reordered. `run()` is never
 * touched, so every variant produces the same frames (per preset) as its original.
 *
 * LIMIT: these are DISTINCT VARIANTS, not independent entries. Independent, human-verified entries
 * remain preferable as the clean set; this is what we can build with two entries.
 */
import type { BeatDef, Messages } from '@/lib/tutor/catalog/types';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';

/** Synonym swaps inside a sentence, per locale. Never touches code, numbers or {placeholders}. */
const PHRASES: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  'vi-VN': [
    ['Nghĩ rằng', 'Cho rằng'],
    ['Hình dung', 'Tưởng tượng'],
    ['Nhìn kết quả vừa kiểm', 'Xem kết quả vừa kiểm'],
    ['Vì vậy', 'Do đó'],
    ['Mảng đã sắp xếp', 'Mảng được sắp xếp'],
    ['Khi lo và hi gặp nhau', 'Lúc lo và hi gặp nhau'],
  ],
  'en-US': [
    ['Thinking', 'Believing'],
    ['Picture', 'Imagine'],
    ['Compute', 'Calculate'],
    ['Look at', 'Examine'],
    ['Add them up', 'Sum them'],
    ['So drop', 'Therefore drop'],
    ['Each comparison', 'Every comparison'],
  ],
};

/** Whole-label renames (preset and beat labels), either locale. */
const LABELS: Readonly<Record<string, string>> = {
  'Ví dụ chuẩn': 'Ví dụ mẫu',
  'Phần tử đầu tiên': 'Phần tử đầu',
  'Nhu cầu nhỏ': 'Nhu cầu ít',
  'Một cây': 'Chỉ một cây',
  'Trúng ngay giữa': 'Trúng ngay ở giữa',
  'Bắt đầu': 'Khởi đầu',
  'Sang phải': 'Đi sang phải',
  'Sang trái': 'Đi sang trái',
  'Thu hẹp': 'Thu hẹp khoảng',
  Classic: 'Standard',
  'First element': 'The first element',
  'Single element': 'One element',
  'Tiny need': 'Small need',
  'One tree': 'A single tree',
  'Take all (H = 0)': 'Take everything (H = 0)',
  Start: 'Beginning',
  'Go right': 'Move right',
  'Go left': 'Move left',
  'Narrow down': 'Narrow the range',
};

type Edit = (s: string, locale: string) => string;

const reword: Edit = (s, locale) =>
  (PHRASES[locale] ?? []).reduce((t, [from, to]) => t.split(from).join(to), s);
const rename: Edit = (s) => LABELS[s] ?? s;

const mapMessages = (m: Messages, f: Edit): Messages =>
  Object.fromEntries(Object.entries(m).map(([l, v]) => [l, f(v, l)]));
const mapHints = (h: BeatDef['hints'], f: Edit): BeatDef['hints'] =>
  h && (h.map((x) => mapMessages(x, f)) as unknown as BeatDef['hints']);

type Op = (e: AnyWalkthroughEntry) => AnyWalkthroughEntry;
const withBeats = (e: AnyWalkthroughEntry, f: (b: BeatDef) => BeatDef): AnyWalkthroughEntry => ({
  ...e,
  beatDefs: e.beatDefs.map(f),
});

export const CLEAN_OPS: Readonly<Record<string, Op>> = {
  'reword-hints': (e) => withBeats(e, (b) => ({ ...b, hints: mapHints(b.hints, reword) })),
  'reword-misconceptions': (e) => ({
    ...withBeats(e, (b) => ({
      ...b,
      misconceptions: b.misconceptions?.map((x) => mapMessages(x, reword)),
    })),
    pitfalls: e.pitfalls?.map((p) => ({ ...p, text: mapMessages(p.text, reword) })),
  }),
  'reword-narration': (e) =>
    withBeats(e, (b) => ({
      ...b,
      narration: mapMessages(b.narration, reword),
      ...(b.ask ? { ask: { ...b.ask, text: mapMessages(b.ask.text, reword) } } : {}),
    })),
  'rename-labels': (e) => ({
    ...withBeats(e, (b) => ({ ...b, label: mapMessages(b.label, rename) })),
    presets: e.presets.map((p) => ({ ...p, label: mapMessages(p.label, rename) })),
  }),
  'reorder-pitfalls': (e) => ({ ...e, pitfalls: e.pitfalls && [...e.pitfalls].reverse() }),
  'reorder-misconceptions': (e) =>
    withBeats(e, (b) => ({
      ...b,
      misconceptions: b.misconceptions && [...b.misconceptions].reverse(),
    })),
  'reorder-presets': (e) => ({ ...e, presets: [...e.presets].reverse() }),
};

/** Op combinations tried per entry, besides the entry itself: each op alone, all of them, pairs. */
const COMBOS: readonly (readonly string[])[] = [
  ...Object.keys(CLEAN_OPS).map((k) => [k]),
  Object.keys(CLEAN_OPS),
  ['reorder-pitfalls', 'reword-hints'],
  ['reorder-presets', 'rename-labels'],
  ['reword-narration', 'reword-misconceptions'],
  ['reorder-misconceptions', 'reword-hints', 'rename-labels'],
];

/** Everything the reviewer can see in the entry, as text (functions such as `run` are not data). */
export function fingerprint(e: AnyWalkthroughEntry): string {
  return JSON.stringify({
    id: e.id,
    title: e.title,
    code: e.code,
    presets: e.presets,
    beatDefs: e.beatDefs,
    problem: e.problem,
    pitfalls: e.pitfalls,
  });
}

export interface CleanVariant {
  /** `<entryId>` for the real entry, `<entryId>~<op>+<op>` for a rewrite. */
  readonly id: string;
  readonly entry: AnyWalkthroughEntry;
  readonly ops: readonly string[];
}

/** The real entries, then their rewrites; a variant identical to an earlier one is dropped. */
export function cleanVariants(entries: readonly AnyWalkthroughEntry[]): CleanVariant[] {
  const seen = new Set<string>();
  const out: CleanVariant[] = [];
  const add = (id: string, entry: AnyWalkthroughEntry, ops: readonly string[]) => {
    const key = fingerprint(entry);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id, entry, ops });
  };
  for (const e of entries) add(e.id, e, []);
  for (const e of entries) {
    for (const ops of COMBOS) {
      add(
        `${e.id}~${ops.join('+')}`,
        ops.reduce((x, k) => CLEAN_OPS[k](x), e),
        ops,
      );
    }
  }
  return out;
}
