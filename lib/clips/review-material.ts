/**
 * The review material of a clip (cards 3A-17, 3B-W): the same `ReviewMaterial` the walkthrough reviewers read, built from a
 * clip module. Mapping (the math reviewer prompt says so):
 *   - a frame is one chapter of one preset: `explanation` is what the teacher says before and after it, `vars` are the numbers
 *     the scene must draw (`expectedDisplay`, the independent recomputation), `state` has the preset input, the times, what the
 *     chapter shows and its formulas;
 *   - a beat is a chapter: `narration` is the line before, `narrationExample` the line after, `ask` the prediction question;
 *   - pitfalls are the misconceptions of the clip sheet.
 * Strings and numbers only; deterministic.
 */
import { msg } from '@/lib/tutor/catalog/messages';
import type {
  ReviewAlt,
  ReviewBeat,
  ReviewFrame,
  ReviewMaterial,
  ReviewScript,
} from '@/lib/tutor/review-schema';
import type { ClipModule } from '@/lib/clips/types';

const text = (before: string, after: string, caption: string): string =>
  [`BEFORE: ${before}`, ...(caption ? [`CAPTION: ${caption}`] : []), `AFTER: ${after}`].join(' | ');

function beatsOf(mod: ClipModule, locale: string): ReviewBeat[] {
  const { entry } = mod;
  return entry.chapters.map((c) => {
    const sheet = entry.sheet.chapters.find((s) => s.id === c.id);
    return {
      id: c.id,
      label: msg(c.label, locale),
      narration: msg(c.before, locale),
      narrationExample: msg(c.after, locale),
      ...(c.ask ? { ask: { text: msg(c.ask, locale) } } : {}),
      ...(sheet ? { hints: sheet.hints.map((h) => msg(h, locale)) } : {}),
      ...(sheet ? { misconceptions: sheet.misconceptions.map((m) => msg(m, locale)) } : {}),
    };
  });
}

function scriptsOf(mod: ClipModule, locale: string): ReviewScript[] {
  const { entry } = mod;
  return entry.presets.map((p) => ({
    preset: p.id,
    totalBeats: entry.chapters.length,
    narratedBeats: entry.chapters.length,
    truncated: false,
    steps: entry.chapters.flatMap((c, i) => [
      { type: 'speech' as const, text: msg(c.before, locale) },
      { type: 'setState' as const, frame: i, ...(c.ask ? { predictBeat: c.id } : {}) },
      { type: 'speech' as const, text: msg(c.after, locale) },
    ]),
  }));
}

export function buildClipReviewMaterial(
  mod: ClipModule,
  locale = 'vi-VN',
  altLocale: string | null = locale === 'vi-VN' ? 'en-US' : 'vi-VN',
): ReviewMaterial {
  const { entry } = mod;
  const frames: ReviewFrame[] = [];
  for (const p of entry.presets) {
    const display = mod.expectedDisplay(p.input as never);
    entry.chapters.forEach((c, i) => {
      const sheet = entry.sheet.chapters.find((s) => s.id === c.id);
      frames.push({
        preset: p.id,
        index: i,
        explanation: text(
          msg(c.before, locale),
          msg(c.after, locale),
          c.caption ? msg(c.caption, locale) : '',
        ),
        ...(altLocale
          ? {
              explanationAlt: text(
                msg(c.before, altLocale),
                msg(c.after, altLocale),
                c.caption ? msg(c.caption, altLocale) : '',
              ),
            }
          : {}),
        vars: display,
        tags: [`beat:${c.id}`],
        state: {
          input: p.input,
          startSec: c.startSec,
          endSec: c.endSec,
          shows: sheet ? msg(sheet.shows, locale) : '',
          formulas: sheet ? sheet.formulas : [],
        },
      });
    });
  }
  const pitfallsOf = (l: string) =>
    entry.sheet.chapters.flatMap((s) =>
      s.misconceptions.map((m) => ({ text: msg(m, l), beat: s.id })),
    );
  const presetsOf = (l: string) => entry.presets.map((p) => ({ id: p.id, label: msg(p.label, l) }));
  const alt: ReviewAlt | undefined = altLocale
    ? {
        locale: altLocale,
        title: msg(entry.title, altLocale),
        presets: presetsOf(altLocale),
        beats: beatsOf(mod, altLocale),
        pitfalls: pitfallsOf(altLocale),
        script: scriptsOf(mod, altLocale),
      }
    : undefined;
  return {
    id: entry.id,
    entryRev: entry.engine.templateRev,
    subject: 'math',
    kind: 'clip',
    locale,
    title: msg(entry.title, locale),
    presets: presetsOf(locale),
    frames,
    beats: beatsOf(mod, locale),
    code: { pseudo: [], cpp: [], py: [], map: { cpp: {}, py: {} } },
    pitfalls: pitfallsOf(locale),
    script: scriptsOf(mod, locale),
    ...(alt ? { alt } : {}),
  };
}
