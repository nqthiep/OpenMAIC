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
 *
 * Equivalent mutants (a change that is not an error) are rejected by `isEquivalentMutant`: a
 * narration whose filled text is unchanged on every beat frame, a code-map move that stays inside
 * the original statement range, a hint taken from a beat with the same decision.
 */
import { fill } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages } from '@/lib/tutor/catalog/types';
import { steps } from '@/lib/tutor/engine/generate';
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

/** What `isEquivalentMutant` needs to know about the planted change, beyond the material. */
export type Probe =
  | { readonly type: 'narration'; readonly beat: string }
  | { readonly type: 'map'; readonly lang: 'cpp' | 'py'; readonly line: number }
  | { readonly type: 'hint'; readonly beat: string; readonly donor: string };

export interface Mutant {
  /** `<entryId>:<kind>:<n>` */
  readonly id: string;
  readonly kind: SeedKind;
  /** Path of the planted error, e.g. `code.impl.cpp[6]` (code lines 1-based). */
  readonly where: string;
  readonly description: string;
  readonly entry: AnyWalkthroughEntry;
  readonly material: ReviewMaterial;
  readonly probe?: Probe;
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

/** Moves of numeric vars from the previous frame to each frame carrying `beat`, e.g. "lo+,mid-". */
function decisionSig(frames: readonly ReviewFrame[], beat: string): string {
  const moves = new Set<string>();
  for (const f of frames) {
    if (!f.tags?.includes(`beat:${beat}`)) continue;
    const prev = frames.find((g) => g.preset === f.preset && g.index === f.index - 1);
    for (const [k, v] of Object.entries(f.vars ?? {})) {
      const w = prev?.vars?.[k];
      if (typeof v === 'number' && typeof w === 'number' && v !== w)
        moves.add(`${k}${v > w ? '+' : '-'}`);
    }
  }
  return [...moves].sort().join(',');
}

/** `vars` of every frame of `entry` (all presets, `locale`) that carries `beat`. */
function beatVars(entry: AnyWalkthroughEntry, beat: string, locale: string) {
  return entry.presets.flatMap((p) =>
    steps(entry, p.input, { locale })
      .filter((f) => f.meta.tags?.includes(`beat:${beat}`))
      .map((f) => f.meta.vars as Record<string, number | string> | undefined),
  );
}

/**
 * True when `mutant` plants no error relative to `original`: the reviewer would see no change, or
 * the change cannot make anything wrong.
 * - narration: the filled narration (every locale) equals the original on every frame of the beat;
 * - map: every new implementation line lies inside the original statement's line range
 *   (a pseudo line mapped to [1..5] and "moved" to [2..5] is not an error);
 * - hint: the donor beat has the same decision as the receiving beat (same moves of lo/hi/...).
 */
export function isEquivalentMutant(
  original: AnyWalkthroughEntry,
  mutant: Pick<Mutant, 'entry' | 'material' | 'probe'>,
  locale = 'vi-VN',
  base: ReviewMaterial = buildReviewMaterial(original, locale),
): boolean {
  if (JSON.stringify(mutant.material) === JSON.stringify(base)) return true;
  const probe = mutant.probe;
  if (!probe) return false;
  switch (probe.type) {
    case 'narration': {
      const was = original.beatDefs.find((b) => b.id === probe.beat)?.narration;
      const now = mutant.entry.beatDefs.find((b) => b.id === probe.beat)?.narration;
      if (!was || !now) return false;
      const vars = beatVars(original, probe.beat, locale);
      return Object.keys({ ...was, ...now }).every((l) =>
        vars.every((v) => fill(was[l] ?? '', v) === fill(now[l] ?? '', v)),
      );
    }
    case 'map': {
      const was = original.code.map[probe.lang][probe.line] ?? [];
      const now = mutant.entry.code.map[probe.lang][probe.line] ?? [];
      if (was.length === 0) return false;
      const [min, max] = [Math.min(...was), Math.max(...was)];
      return now.every((l) => l >= min && l <= max);
    }
    case 'hint':
      return decisionSig(base.frames, probe.beat) === decisionSig(base.frames, probe.donor);
  }
}

/**
 * The first `n` non-equivalent mutants of `items`: the evenly spread ones first, then, for each one
 * `make` rejects (null), the next unused item.
 */
function take<T>(items: readonly T[], n: number, make: (t: T) => Mutant | null): Mutant[] {
  const first = pick(items, n);
  const out: Mutant[] = [];
  for (const it of [...first, ...items.filter((x) => !first.includes(x))]) {
    if (out.length >= n) break;
    const m = make(it);
    if (m) out.push(m);
  }
  return out;
}

export function seedErrors(entry: AnyWalkthroughEntry, locale = 'vi-VN'): Mutant[] {
  const base = buildReviewMaterial(entry, locale);
  const out: Mutant[] = [];
  const count: Partial<Record<SeedKind, number>> = {};

  /** One candidate; null when equivalent (see `isEquivalentMutant`). Ids are given by `keep`. */
  const make = (
    kind: SeedKind,
    where: string,
    description: string,
    mutated: AnyWalkthroughEntry | null,
    material?: ReviewMaterial,
    probe?: Probe,
  ): Mutant | null => {
    const e = mutated ?? entry;
    const m: Mutant = {
      id: '',
      kind,
      where,
      description,
      entry: e,
      material: material ?? buildReviewMaterial(e, locale),
      ...(probe ? { probe } : {}),
    };
    return isEquivalentMutant(entry, m, locale, base) ? null : m;
  };
  const keep = (ms: readonly Mutant[]): void => {
    for (const m of ms) {
      const n = (count[m.kind] = (count[m.kind] ?? 0) + 1);
      out.push({ ...m, id: `${entry.id}:${m.kind}:${n}` });
    }
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
  const withFrame = (f: ReviewFrame, explanation: string, alt?: string): ReviewMaterial => ({
    ...base,
    frames: base.frames.map((g) =>
      g === f ? { ...g, explanation, ...(alt !== undefined ? { explanationAlt: alt } : {}) } : g,
    ),
  });

  // 1. Frame explanations: a number off by one, and a reversed direction word (both locales alike).
  const frameAt = (f: ReviewFrame) => `frames[${f.preset}#${f.index}].explanation`;
  const numeric = base.frames.filter((f) => /\d/.test(f.explanation));
  keep(
    take(numeric, 8, (f) => {
      const vals = new Set(Object.values(f.vars ?? {}).map(String));
      const hits = [...f.explanation.matchAll(/\d+/g)];
      const hit = hits.find((h) => vals.has(h[0])) ?? hits[0];
      const wrong = String(Number(hit[0]) + 1);
      const text =
        f.explanation.slice(0, hit.index) + wrong + f.explanation.slice(hit.index + hit[0].length);
      let alt: string | undefined;
      if (f.explanationAlt !== undefined) {
        const ah = [...f.explanationAlt.matchAll(/\d+/g)];
        const at =
          ah[hits.indexOf(hit)]?.[0] === hit[0]
            ? ah[hits.indexOf(hit)]
            : ah.find((x) => x[0] === hit[0]);
        alt = at
          ? f.explanationAlt.slice(0, at.index) +
            wrong +
            f.explanationAlt.slice(at.index + at[0].length)
          : f.explanationAlt;
      }
      return make(
        'explanation',
        frameAt(f),
        `number ${hit[0]} became ${wrong}`,
        null,
        withFrame(f, text, alt),
      );
    }),
  );
  const flippable = base.frames.flatMap((f) => {
    const found = FLIPS.filter(([from]) => f.explanation.includes(from))
      .map(([from, to]) => ({ from, to, at: f.explanation.indexOf(from) }))
      .sort((a, b) => a.at - b.at)[0];
    return found ? [{ f, ...found }] : [];
  });
  keep(
    take(flippable, 4, ({ f, from, to }) => {
      const altFlip =
        f.explanationAlt === undefined
          ? undefined
          : FLIPS.filter(([x]) => f.explanationAlt!.includes(x))
              .map(([x, y]) => ({ x, y, at: f.explanationAlt!.indexOf(x) }))
              .sort((a, b) => a.at - b.at)[0];
      const alt = altFlip ? f.explanationAlt!.replace(altFlip.x, altFlip.y) : f.explanationAlt;
      return make(
        'explanation',
        frameAt(f),
        `"${from}" became "${to}"`,
        null,
        withFrame(f, f.explanation.replace(from, to), alt),
      );
    }),
  );

  // 2. Narration: one placeholder swapped for another variable of the same beat. The pair is the
  //    first one whose swap changes the filled narration on some frame of the beat.
  const names = (s: string) => [
    ...new Set([...s.matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1])),
  ];
  const swappable = entry.beatDefs.flatMap((b, i) =>
    names(Object.values(b.narration).join(' ')).length >= 2 ? [{ b, i }] : [],
  );
  keep(
    take(swappable, 5, ({ b, i }) => {
      const ns = names(Object.values(b.narration).join(' '));
      for (const a of ns) {
        for (const c of ns) {
          if (a === c) continue;
          const narration = editMessages(b.narration, (s) => s.replace(`{${a}}`, `{${c}}`));
          if (!narration) continue;
          const m = make(
            'narration',
            `beatDefs.${b.id}.narration`,
            `{${a}} became {${c}}`,
            withBeat(i, { ...b, narration }),
            undefined,
            { type: 'narration', beat: b.id },
          );
          if (m) return m;
        }
      }
      return null;
    }),
  );

  // 3. C++ / Python text: off-by-one and wrong comparison.
  for (const lang of ['cpp', 'py'] as const) {
    const lines = entry.code.impl[lang];
    const edits = lines.flatMap((line, i) => {
      const [code, comment] = split(line, lang);
      const next = applyRule(code, CODE_RULES);
      return next === null ? [] : [{ i, line: next + comment }];
    });
    keep(
      take(edits, 6, ({ i, line }) => {
        const copy = [...lines];
        copy[i] = line;
        return make(
          'impl-off-by-one',
          `code.impl.${lang}[${i + 1}]`,
          `"${lines[i].trim()}" became "${line.trim()}"`,
          withImpl(lang, copy),
        );
      }),
    );
  }

  // 4. Language-specific pitfalls: a pitfall on the wrong language; a comment from the other language.
  keep(
    (entry.pitfalls ?? []).flatMap((p, i) => {
      if (!p.lang) return [];
      const lang = p.lang === 'cpp' ? 'py' : 'cpp';
      const m = make(
        'pitfall-lang',
        `pitfalls[${i}].lang`,
        `pitfall now says ${lang}, was ${p.lang}`,
        withPitfall(i, { ...p, lang }),
      );
      return m ? [m] : [];
    }),
  );
  const comment = (lang: Lang) => {
    const lines = entry.code.impl[lang];
    const i = lines.findIndex((l) => split(l, lang)[1] !== '');
    return i < 0 ? null : { i, code: split(lines[i], lang)[0], text: split(lines[i], lang)[1] };
  };
  const [cc, pc] = [comment('cpp'), comment('py')];
  if (cc && pc) {
    const cLines = [...entry.code.impl.cpp];
    cLines[cc.i] = cc.code + pc.text.replace(/^(\s*)#/, '$1//');
    const pLines = [...entry.code.impl.py];
    pLines[pc.i] = pc.code + cc.text.replace(/^(\s*)\/\//, '$1#');
    keep(
      [
        make(
          'pitfall-lang',
          `code.impl.cpp[${cc.i + 1}]`,
          'C++ comment replaced by the Python comment',
          withImpl('cpp', cLines),
        ),
        make(
          'pitfall-lang',
          `code.impl.py[${pc.i + 1}]`,
          'Python comment replaced by the C++ comment',
          withImpl('py', pLines),
        ),
      ].flatMap((m) => (m ? [m] : [])),
    );
  }

  // 5. Invariants: pseudocode conditions and updates, and "≤" in the teaching text.
  const pseudo = entry.code.pseudo.flatMap((line, i) => {
    const next = applyRule(line, PSEUDO_RULES);
    return next === null ? [] : [{ i, line: next }];
  });
  keep(
    take(pseudo, 5, ({ i, line }) => {
      const copy = [...entry.code.pseudo];
      copy[i] = line;
      return make(
        'invariant',
        `code.pseudo[${i + 1}]`,
        `"${entry.code.pseudo[i].trim()}" became "${line.trim()}"`,
        withCode({ pseudo: copy }),
      );
    }),
  );
  const le: Edit = (s) => s.replace('≤', '<');
  const sites: { where: string; mutate: () => AnyWalkthroughEntry | null }[] = [];
  entry.beatDefs.forEach((b, i) => {
    sites.push({
      where: `beatDefs.${b.id}.narration`,
      mutate: () => {
        const next = editMessages(b.narration, le);
        return next ? withBeat(i, { ...b, narration: next }) : null;
      },
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
  keep(take(withLe, 3, ({ where, e }) => make('invariant', where, '"≤" became "<"', e)));

  // 6. Code map: a pseudocode line pointed at an implementation line OUTSIDE the lines it was
  //    mapped to (just below them, or above if there is no room below).
  for (const lang of ['cpp', 'py'] as const) {
    const map = entry.code.map[lang];
    const max = entry.code.impl[lang].length;
    const rows = Object.entries(map).filter(([, v]) => v.length > 0);
    keep(
      take(rows, 5, ([pl, impl]) => {
        const [lo, hi] = [Math.min(...impl), Math.max(...impl)];
        const target = hi + 1 <= max ? hi + 1 : lo - 1 >= 1 ? lo - 1 : null;
        if (target === null) return null;
        return make(
          'map',
          `code.map.${lang}[${pl}]`,
          `pseudo line ${pl} now maps to ${target}, was ${impl.join(',')}`,
          withCode({ map: { ...entry.code.map, [lang]: { ...map, [pl]: [target] } } }),
          undefined,
          { type: 'map', lang, line: Number(pl) },
        );
      }),
    );
  }

  // 7. Hints: levels 1 and 3 swapped (the last hint given first), or hint 2 taken from a beat
  //    whose decision differs (e.g. go-left for go-right); a same-decision donor is not an error.
  const hinted = entry.beatDefs.flatMap((b, i) => (b.hints ? [{ b, i, hints: b.hints }] : []));
  keep(
    take(hinted, 3, ({ b, i, hints }) =>
      make(
        'hint',
        `beatDefs.${b.id}.hints`,
        'hints 1 and 3 swapped',
        withBeat(i, { ...b, hints: [hints[2], hints[1], hints[0]] }),
      ),
    ),
  );
  keep(
    take(hinted, 3, ({ b, i, hints }) => {
      const mySig = decisionSig(base.frames, b.id);
      const donor = hinted.find(
        (h) => h.b.id !== b.id && decisionSig(base.frames, h.b.id) !== mySig,
      );
      if (!donor) return null;
      return make(
        'hint',
        `beatDefs.${b.id}.hints[1]`,
        `hint 2 replaced by the hint 2 of beat "${donor.b.id}"`,
        withBeat(i, { ...b, hints: [hints[0], donor.hints[1], hints[2]] }),
        undefined,
        { type: 'hint', beat: b.id, donor: donor.b.id },
      );
    }),
  );

  return out;
}
