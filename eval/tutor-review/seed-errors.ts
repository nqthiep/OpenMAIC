/**
 * Seeded-error generator for the review-panel calibration (ADR 0014 decision 7).
 *
 * `seedErrors(entry)` takes a valid walkthrough entry and returns labelled mutants, each with ONE
 * planted error: wrong numbers or logic in a frame explanation, a wrong variable in a narration,
 * an off-by-one in the C++/Python text, a language-specific pitfall attached to the wrong language,
 * a wrong invariant, a wrong code map line, a wrong or misordered hint.
 *
 * Mutations change the entry DATA (strings and numbers); `run()` is never touched. A mutant is
 * `entry` (a copy with mutated data) plus `material` (what the reviewer sees). Errors in frame
 * explanations cannot live in the entry (they are produced by `run()`), so those edit the frame
 * strings of `material` only; `entry` is then the unmodified original. Pure and deterministic.
 */
import type { BeatDef, Messages } from '@/lib/tutor/catalog/types';
import {
  buildReviewMaterial,
  type ReviewFrame,
  type ReviewMaterial,
} from '@/lib/tutor/review-schema';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';

export const SEED_KINDS = [
  'explanation',
  'narration',
  'impl-off-by-one',
  'pitfall-lang',
  'invariant',
  'map',
  'hint',
] as const;
export type SeedKind = (typeof SEED_KINDS)[number];

export interface Mutant {
  /** `<entryId>:<kind>:<n>` */
  readonly id: string;
  readonly kind: SeedKind;
  /** Path of the planted error, e.g. `code.impl.cpp[6]` (code lines 1-based). */
  readonly where: string;
  readonly description: string;
  readonly entry: AnyWalkthroughEntry;
  readonly material: ReviewMaterial;
}

type Edit = (s: string) => string;
type Code = AnyWalkthroughEntry['code'];
type Lang = 'cpp' | 'py';

/** `n` items spread evenly over the list (all of them if `n` >= length). */
function pick<T>(items: readonly T[], n: number): T[] {
  if (n >= items.length) return [...items];
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);
}

/** `m` with `f` applied to every locale; null if no locale changed. */
function editMessages(m: Messages, f: Edit): Messages | null {
  const out: Record<string, string> = {};
  let changed = false;
  for (const [k, v] of Object.entries(m)) {
    out[k] = f(v);
    changed ||= out[k] !== v;
  }
  return changed ? out : null;
}

/** First rule whose pattern matches `s` → `s` with that one match replaced; null if none match. */
function applyRule(s: string, rules: readonly (readonly [RegExp, string])[]): string | null {
  for (const [re, to] of rules) if (re.test(s)) return s.replace(re, to);
  return null;
}

/**
 * Off-by-one and wrong-boundary rules for code text. Not `<` ↔ `<=`: where the equal case already
 * returned, that edit leaves the program correct (an equivalent mutant, not an error).
 */
const CODE_RULES: readonly (readonly [RegExp, string])[] = [
  [/<=/, '<'],
  [/>=/, '>'],
  [/ [+-] 1\b/, ''],
  [/ = 0\b/, ' = 1'],
];
const PSEUDO_RULES: readonly (readonly [RegExp, string])[] = [
  [/≤/, '<'],
  [/≥/, '>'],
  [/ [+\-−] 1\b/, ''],
];
/** Words whose swap reverses the meaning of a sentence about direction or order. */
const FLIPS: readonly (readonly [string, string])[] = [
  ['nhỏ hơn', 'lớn hơn'],
  ['lớn hơn', 'nhỏ hơn'],
  ['nửa trái', 'nửa phải'],
  ['nửa phải', 'nửa trái'],
  ['bên trái', 'bên phải'],
  ['bên phải', 'bên trái'],
  ['smaller', 'larger'],
  ['larger', 'smaller'],
  ['left half', 'right half'],
  ['right half', 'left half'],
];

const COMMENT: Record<Lang, RegExp> = { cpp: /\s*\/\/.*$/, py: /\s*#.*$/ };
const split = (line: string, lang: Lang): [string, string] => {
  const m = COMMENT[lang].exec(line);
  return m ? [line.slice(0, m.index), m[0]] : [line, ''];
};

export function seedErrors(entry: AnyWalkthroughEntry, locale = 'vi-VN'): Mutant[] {
  const base = buildReviewMaterial(entry, locale);
  const baseJson = JSON.stringify(base);
  const out: Mutant[] = [];
  const count: Partial<Record<SeedKind, number>> = {};

  const add = (
    kind: SeedKind,
    where: string,
    description: string,
    mutated: AnyWalkthroughEntry | null,
    material?: ReviewMaterial,
  ): void => {
    const e = mutated ?? entry;
    const mat = material ?? buildReviewMaterial(e, locale);
    // A mutant the reviewer cannot see (the edit hit only another locale) is not a mutant.
    if (JSON.stringify(mat) === baseJson) return;
    const n = (count[kind] = (count[kind] ?? 0) + 1);
    out.push({ id: `${entry.id}:${kind}:${n}`, kind, where, description, entry: e, material: mat });
  };

  const withCode = (patch: Partial<Code>): AnyWalkthroughEntry => ({
    ...entry,
    code: { ...entry.code, ...patch },
  });
  const withImpl = (lang: Lang, lines: string[]): AnyWalkthroughEntry =>
    withCode({ impl: { ...entry.code.impl, [lang]: lines } });
  const withBeat = (i: number, beat: BeatDef): AnyWalkthroughEntry => ({
    ...entry,
    beatDefs: entry.beatDefs.map((b, j) => (j === i ? beat : b)),
  });
  const withPitfall = (i: number, p: NonNullable<AnyWalkthroughEntry['pitfalls']>[number]) => ({
    ...entry,
    pitfalls: (entry.pitfalls ?? []).map((q, j) => (j === i ? p : q)),
  });
  const withFrame = (f: ReviewFrame, explanation: string): ReviewMaterial => ({
    ...base,
    frames: base.frames.map((g) => (g === f ? { ...g, explanation } : g)),
  });

  // 1. Frame explanations: a number off by one, and a reversed direction word.
  const frameAt = (f: ReviewFrame) => `frames[${f.preset}#${f.index}].explanation`;
  const numeric = base.frames.filter((f) => /\d/.test(f.explanation));
  for (const f of pick(numeric, 8)) {
    const vals = new Set(Object.values(f.vars ?? {}).map(String));
    const hits = [...f.explanation.matchAll(/\d+/g)];
    const hit = hits.find((h) => vals.has(h[0])) ?? hits[0];
    const wrong = String(Number(hit[0]) + 1);
    const text =
      f.explanation.slice(0, hit.index) + wrong + f.explanation.slice(hit.index + hit[0].length);
    add('explanation', frameAt(f), `number ${hit[0]} became ${wrong}`, null, withFrame(f, text));
  }
  const flippable = base.frames.flatMap((f) => {
    const found = FLIPS.filter(([from]) => f.explanation.includes(from))
      .map(([from, to]) => ({ from, to, at: f.explanation.indexOf(from) }))
      .sort((a, b) => a.at - b.at)[0];
    return found ? [{ f, ...found }] : [];
  });
  for (const { f, from, to } of pick(flippable, 4)) {
    add(
      'explanation',
      frameAt(f),
      `"${from}" became "${to}"`,
      null,
      withFrame(f, f.explanation.replace(from, to)),
    );
  }

  // 2. Narration: one placeholder swapped for another variable of the same beat.
  const names = (s: string) => [
    ...new Set([...s.matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1])),
  ];
  const swappable = entry.beatDefs.flatMap((b, i) => {
    const ns = names(Object.values(b.narration).join(' '));
    return ns.length >= 2 ? [{ b, i, a: ns[0], c: ns[1] }] : [];
  });
  for (const { b, i, a, c } of pick(swappable, 5)) {
    const narration = editMessages(b.narration, (s) => s.replace(`{${a}}`, `{${c}}`));
    if (narration) {
      add(
        'narration',
        `beatDefs.${b.id}.narration`,
        `{${a}} became {${c}}`,
        withBeat(i, { ...b, narration }),
      );
    }
  }

  // 3. C++ / Python text: off-by-one and wrong comparison.
  for (const lang of ['cpp', 'py'] as const) {
    const lines = entry.code.impl[lang];
    const edits = lines.flatMap((line, i) => {
      const [code, comment] = split(line, lang);
      const next = applyRule(code, CODE_RULES);
      return next === null ? [] : [{ i, line: next + comment }];
    });
    for (const { i, line } of pick(edits, 6)) {
      const copy = [...lines];
      copy[i] = line;
      add(
        'impl-off-by-one',
        `code.impl.${lang}[${i + 1}]`,
        `"${lines[i].trim()}" became "${line.trim()}"`,
        withImpl(lang, copy),
      );
    }
  }

  // 4. Language-specific pitfalls: a pitfall on the wrong language; a comment from the other language.
  (entry.pitfalls ?? []).forEach((p, i) => {
    if (!p.lang) return;
    const lang = p.lang === 'cpp' ? 'py' : 'cpp';
    add(
      'pitfall-lang',
      `pitfalls[${i}].lang`,
      `pitfall now says ${lang}, was ${p.lang}`,
      withPitfall(i, { ...p, lang }),
    );
  });
  const comment = (lang: Lang) => {
    const lines = entry.code.impl[lang];
    const i = lines.findIndex((l) => split(l, lang)[1] !== '');
    return i < 0 ? null : { i, code: split(lines[i], lang)[0], text: split(lines[i], lang)[1] };
  };
  const [cc, pc] = [comment('cpp'), comment('py')];
  if (cc && pc) {
    const cLines = [...entry.code.impl.cpp];
    cLines[cc.i] = cc.code + pc.text.replace(/^(\s*)#/, '$1//');
    add(
      'pitfall-lang',
      `code.impl.cpp[${cc.i + 1}]`,
      'C++ comment replaced by the Python comment',
      withImpl('cpp', cLines),
    );
    const pLines = [...entry.code.impl.py];
    pLines[pc.i] = pc.code + cc.text.replace(/^(\s*)\/\//, '$1#');
    add(
      'pitfall-lang',
      `code.impl.py[${pc.i + 1}]`,
      'Python comment replaced by the C++ comment',
      withImpl('py', pLines),
    );
  }

  // 5. Invariants: pseudocode conditions and updates, and "≤" in the teaching text.
  const pseudo = entry.code.pseudo.flatMap((line, i) => {
    const next = applyRule(line, PSEUDO_RULES);
    return next === null ? [] : [{ i, line: next }];
  });
  for (const { i, line } of pick(pseudo, 5)) {
    const copy = [...entry.code.pseudo];
    copy[i] = line;
    add(
      'invariant',
      `code.pseudo[${i + 1}]`,
      `"${entry.code.pseudo[i].trim()}" became "${line.trim()}"`,
      withCode({ pseudo: copy }),
    );
  }
  const le: Edit = (s) => s.replace('≤', '<');
  const sites: { where: string; mutate: () => AnyWalkthroughEntry | null }[] = [];
  entry.beatDefs.forEach((b, i) => {
    const edit = (key: 'narration', m: Messages) => {
      const next = editMessages(m, le);
      return next ? withBeat(i, { ...b, [key]: next }) : null;
    };
    sites.push({
      where: `beatDefs.${b.id}.narration`,
      mutate: () => edit('narration', b.narration),
    });
    (b.hints ?? []).forEach((h, k) =>
      sites.push({
        where: `beatDefs.${b.id}.hints[${k}]`,
        mutate: () => {
          const next = editMessages(h, le);
          return next
            ? withBeat(i, {
                ...b,
                hints: b.hints!.map((x, j) => (j === k ? next : x)) as unknown as BeatDef['hints'],
              })
            : null;
        },
      }),
    );
  });
  (entry.pitfalls ?? []).forEach((p, i) =>
    sites.push({
      where: `pitfalls[${i}].text`,
      mutate: () => {
        const next = editMessages(p.text, le);
        return next ? withPitfall(i, { ...p, text: next }) : null;
      },
    }),
  );
  const withLe = sites.flatMap((s) => {
    const e = s.mutate();
    return e ? [{ where: s.where, e }] : [];
  });
  for (const { where, e } of pick(withLe, 3)) add('invariant', where, '"≤" became "<"', e);

  // 6. Code map: the first implementation line of a pseudocode line moved by one.
  for (const lang of ['cpp', 'py'] as const) {
    const map = entry.code.map[lang];
    const max = entry.code.impl[lang].length;
    const rows = Object.entries(map).filter(([, v]) => v.length > 0);
    for (const [pl, impl] of pick(rows, 5)) {
      const shifted = impl[0] + 1 <= max ? impl[0] + 1 : impl[0] - 1;
      const next = { ...map, [pl]: [shifted, ...impl.slice(1)] };
      add(
        'map',
        `code.map.${lang}[${pl}]`,
        `pseudo line ${pl} now maps to ${shifted}, was ${impl[0]}`,
        withCode({ map: { ...entry.code.map, [lang]: next } }),
      );
    }
  }

  // 7. Hints: levels 1 and 3 swapped (the last hint given first), or a hint from another beat.
  const hinted = entry.beatDefs.flatMap((b, i) => (b.hints ? [{ b, i, hints: b.hints }] : []));
  for (const { b, i, hints } of pick(hinted, 3)) {
    add(
      'hint',
      `beatDefs.${b.id}.hints`,
      'hints 1 and 3 swapped',
      withBeat(i, { ...b, hints: [hints[2], hints[1], hints[0]] }),
    );
  }
  const pairs = hinted.flatMap((h, k) =>
    hinted[k + 1] ? [{ ...h, other: hinted[k + 1].hints[1] }] : [],
  );
  for (const { b, i, hints, other } of pick(pairs, 3)) {
    add(
      'hint',
      `beatDefs.${b.id}.hints[1]`,
      'hint 2 replaced by the hint 2 of the next beat',
      withBeat(i, { ...b, hints: [hints[0], other, hints[2]] }),
    );
  }

  return out;
}
