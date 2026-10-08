/**
 * Seeded errors and clean variants for the math review panel (card 3A-17, ADR 0014 decision 7).
 *
 * `seedClipErrors(mod)` returns labelled mutants of a clip, each with ONE planted error of a kind the card names:
 *   missing-condition  a sentence that states a condition or the equality case is dropped
 *   wrong-equality     the direction of an inequality, or an equality, is flipped in a caption or a formula
 *   special-figure     a closing sentence "proves" the general claim from the one figure drawn
 *   wrong-number       a number in the teacher's `before`/`after` line is changed in one locale only
 *   wrong-display      a number the scene must draw (the manifest `display`) is wrong
 *   wrong-line         the `before` and `after` lines of a chapter are swapped
 * A mutant is the review material of the changed clip; the clip itself (`mod`) is not touched. Mutations that change nothing
 * are never returned. Pure and deterministic.
 *
 * `cleanClipVariants(mods)` returns known-good variants: the real clips and semantics-preserving rewrites (presets or
 * misconceptions reordered). They are distinct variants, not independent clips.
 */
import { buildClipReviewMaterial } from '@/lib/clips/review-material';
import type { ClipChapter, ClipModule, ClipSheetChapter } from '@/lib/clips/types';
import type { ReviewMaterial } from '@/lib/tutor/review-schema';

export const MATH_SEED_KINDS = [
  'missing-condition',
  'wrong-equality',
  'special-figure',
  'wrong-number',
  'wrong-display',
  'wrong-line',
] as const;
export type MathSeedKind = (typeof MATH_SEED_KINDS)[number];

export interface ClipMutant {
  /** `<clipId>:<kind>:<n>` */
  readonly id: string;
  readonly kind: MathSeedKind;
  readonly where: string;
  readonly description: string;
  readonly material: ReviewMaterial;
}

const VI = 'vi-VN';
const EN = 'en-US';

const FALLACY: Readonly<Record<string, string>> = {
  [VI]: ' Vì hình ta vẽ là trường hợp đặc biệt rất đẹp nên kết luận này đúng cho mọi trường hợp, không cần chứng minh thêm.',
  [EN]: ' Since the figure we drew is a nice special case, this conclusion holds in every case and needs no further proof.',
};
/** A sentence that carries a condition or the equality case. */
const CONDITION: Readonly<Record<string, RegExp>> = {
  [VI]: /(\bkhi\b|chỉ khi|với mọi|không âm|dương|điều kiện|nếu)/i,
  [EN]: /(\bwhen\b|only when|\bif\b|for all|every|non-negative|positive|condition)/i,
};

const sentences = (s: string): string[] => s.match(/[^.!?]+[.!?]*\s*/g) ?? [s];

const withEntry = (
  mod: ClipModule,
  chapters: readonly ClipChapter[],
  sheet?: readonly ClipSheetChapter[],
): ClipModule => ({
  ...mod,
  entry: { ...mod.entry, chapters, ...(sheet ? { sheet: { chapters: sheet } } : {}) },
});

const setChapter = (mod: ClipModule, i: number, patch: Partial<ClipChapter>): ClipModule =>
  withEntry(
    mod,
    mod.entry.chapters.map((c, k) => (k === i ? { ...c, ...patch } : c)),
  );

const flip = (s: string): string =>
  s.includes('≤')
    ? s.replace('≤', '≥')
    : s.includes('≥')
      ? s.replace('≥', '≤')
      : s.includes('\\le')
        ? s.replace('\\le', '\\ge')
        : s.includes('⇔')
          ? s.replace('=', '<')
          : s.includes('=')
            ? s.replace('=', '≠')
            : s;

function candidates(
  mod: ClipModule,
): { kind: MathSeedKind; where: string; description: string; make: () => ReviewMaterial }[] {
  const { entry } = mod;
  const out: {
    kind: MathSeedKind;
    where: string;
    description: string;
    make: () => ReviewMaterial;
  }[] = [];
  const material = (m: ClipModule) => () => buildClipReviewMaterial(m);
  const last = entry.chapters.length - 1;

  // wrong-number: the first chapter line with a number, changed in vi-VN only (so the two locales also disagree)
  for (const [i, c] of entry.chapters.entries()) {
    for (const part of ['before', 'after'] as const) {
      const t = c[part][VI];
      const m = t?.match(/\d+/);
      if (!m) continue;
      const changed = t.replace(/\d+/, String(Number(m[0]) + 1));
      out.push({
        kind: 'wrong-number',
        where: `chapters[${i}].${part}`,
        description: `${m[0]} became ${Number(m[0]) + 1} in the vi-VN line`,
        make: material(setChapter(mod, i, { [part]: { ...c[part], [VI]: changed } })),
      });
      break;
    }
    if (out.filter((o) => o.kind === 'wrong-number').length >= 2) break;
  }

  // wrong-equality: a caption (both locales), else a formula of the sheet
  for (const [i, c] of entry.chapters.entries()) {
    const cap = c.caption;
    if (!cap) continue;
    const changed = Object.fromEntries(Object.entries(cap).map(([l, v]) => [l, flip(v)]));
    if (JSON.stringify(changed) === JSON.stringify(cap)) continue;
    out.push({
      kind: 'wrong-equality',
      where: `chapters[${i}].caption`,
      description: `the relation of the caption "${cap[VI]}" was flipped`,
      make: material(setChapter(mod, i, { caption: changed })),
    });
    break;
  }
  for (const [i, s] of entry.sheet.chapters.entries()) {
    const k = s.formulas.findIndex((f) => flip(f) !== f);
    if (k < 0) continue;
    const sheet = entry.sheet.chapters.map((x, j) =>
      j === i ? { ...x, formulas: x.formulas.map((f, n) => (n === k ? flip(f) : f)) } : x,
    );
    out.push({
      kind: 'wrong-equality',
      where: `sheet.chapters[${i}].formulas[${k}]`,
      description: 'a formula of the sheet had its relation flipped',
      make: material(withEntry(mod, entry.chapters, sheet)),
    });
    break;
  }

  // special-figure: the last chapter's closing line claims the general case from the figure
  out.push({
    kind: 'special-figure',
    where: `chapters[${last}].after`,
    description: 'the closing line proves the general claim from the special figure',
    make: material(
      setChapter(mod, last, {
        after: Object.fromEntries(
          Object.entries(entry.chapters[last].after).map(([l, v]) => [
            l,
            `${v.trimEnd()}${FALLACY[l] ?? ''}`,
          ]),
        ),
      }),
    ),
  });

  // missing-condition: the first sentence that states a condition, dropped from both locales
  for (const [i, c] of entry.chapters.entries()) {
    // the same sentence goes from both locales (found in vi-VN), so the two stay aligned
    const drop = (m: Record<string, string>) => {
      const ss = sentences(m[VI] ?? '');
      const k = ss.findIndex((x) => CONDITION[VI].test(x));
      if (k < 0 || ss.length < 2) return m;
      return Object.fromEntries(
        Object.entries(m).map(([l, v]) => {
          const parts = sentences(v);
          return [
            l,
            parts.length === ss.length
              ? parts
                  .filter((_, n) => n !== k)
                  .join('')
                  .trim()
              : v,
          ];
        }),
      );
    };
    for (const part of ['before', 'after'] as const) {
      const changed = drop(c[part]);
      if (JSON.stringify(changed) === JSON.stringify(c[part])) continue;
      out.push({
        kind: 'missing-condition',
        where: `chapters[${i}].${part}`,
        description: 'the sentence that states the condition or the equality case was dropped',
        make: material(setChapter(mod, i, { [part]: changed })),
      });
      break;
    }
    if (out.some((o) => o.kind === 'missing-condition')) break;
  }

  // wrong-display: one number the scene must draw is wrong, in the first preset
  const p0 = entry.presets[0];
  const shown = mod.expectedDisplay(p0.input as never);
  const key = Object.keys(shown)[0];
  out.push({
    kind: 'wrong-display',
    where: `presets[${p0.id}].display.${key}`,
    description: `display "${key}" is ${shown[key] + 1} instead of ${shown[key]}`,
    make: () => {
      const m = buildClipReviewMaterial(mod);
      return {
        ...m,
        frames: m.frames.map((f) =>
          f.preset === p0.id ? { ...f, vars: { ...f.vars, [key]: shown[key] + 1 } } : f,
        ),
      };
    },
  });

  // wrong-line: before and after swapped in one chapter
  const c0 = entry.chapters[0];
  out.push({
    kind: 'wrong-line',
    where: 'chapters[0]',
    description: 'the before and after lines of the first chapter were swapped',
    make: material(setChapter(mod, 0, { before: c0.after, after: c0.before })),
  });
  return out;
}

export function seedClipErrors(mod: ClipModule): ClipMutant[] {
  const original = JSON.stringify(buildClipReviewMaterial(mod));
  const counts = new Map<MathSeedKind, number>();
  const out: ClipMutant[] = [];
  for (const c of candidates(mod)) {
    const material = c.make();
    if (JSON.stringify(material) === original) continue; // equivalent: not an error
    const n = (counts.get(c.kind) ?? 0) + 1;
    counts.set(c.kind, n);
    out.push({
      id: `${mod.entry.id}:${c.kind}:${n}`,
      kind: c.kind,
      where: c.where,
      description: c.description,
      material,
    });
  }
  return out;
}

export interface CleanClip {
  readonly id: string;
  readonly ops: readonly string[];
  readonly material: ReviewMaterial;
}

export function cleanClipVariants(mods: readonly ClipModule[]): CleanClip[] {
  const out: CleanClip[] = [];
  for (const mod of mods) {
    const { entry } = mod;
    out.push({ id: entry.id, ops: [], material: buildClipReviewMaterial(mod) });
    const presets = [...entry.presets].reverse();
    out.push({
      id: `${entry.id}:rev-presets`,
      ops: ['reverse-presets'],
      material: buildClipReviewMaterial({ ...mod, entry: { ...entry, presets } }),
    });
    const sheet = entry.sheet.chapters.map((s) => ({
      ...s,
      misconceptions: [...s.misconceptions].reverse(),
    }));
    out.push({
      id: `${entry.id}:rev-misconceptions`,
      ops: ['reverse-misconceptions'],
      material: buildClipReviewMaterial(withEntry(mod, entry.chapters, sheet)),
    });
  }
  const seen = new Set<string>();
  return out.filter((v) => {
    const f = JSON.stringify(v.material);
    if (seen.has(f)) return false;
    seen.add(f);
    return true;
  });
}
