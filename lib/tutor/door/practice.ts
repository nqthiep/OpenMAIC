/**
 * Practice questions for the student door, built from a catalog entry's own prediction beats.
 * No code to run and no LLM: the question text and the correct option come from the entry
 * (`ask`, `predict.answer`), and the context is the frame the student would see in the widget, so an
 * answer key can only be as wrong as the entry itself (which `tests/subjects` already pins).
 *
 * Variety is bounded by the entry's presets; custom input stays closed until slice 1d.
 */
import type { QuizQuestion } from '@openmaic/dsl';

import { fill, msg } from '@/lib/tutor/catalog/messages';
import { presetFrames } from '@/lib/tutor/engine/preset-frames';
import type { Frame } from '@/lib/tutor/engine/types';
import { hasStateReader, readState } from '@/lib/tutor/door/state-text';
import { MAX_ASKS_PER_BEAT } from '@/lib/tutor/provider';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';

export const PRACTICE_COUNT = 5;
const LETTERS = 'ABCDEFGH';
const MAX_VALUES = 24;

export interface PracticeOptions {
  readonly locale: string;
  readonly count?: number;
  /** Picks which questions of a long entry are shown; the same seed gives the same set. */
  readonly seed?: number;
}

interface Candidate {
  readonly id: string;
  readonly beatId: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly answer: number;
  readonly analysis: string;
}

/** mulberry32: a few lines of integer arithmetic, so a seed always gives the same order. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_MARKS = 8;

/** A highlight key as the student would say it: a grid key `r,c` is "row r, column c". */
function markName(visualizer: string, key: string, locale: string): string {
  const cell = visualizer === 'grid' ? /^(\d+),(\d+)$/.exec(key) : null;
  if (!cell) return key;
  return locale === 'vi-VN'
    ? `hàng ${cell[1]}, cột ${cell[2]}`
    : `row ${cell[1]}, column ${cell[2]}`;
}

const KIND_WORDS: Readonly<Record<string, Record<string, string>>> = {
  'vi-VN': { active: 'đang xét', compare: 'so sánh', result: 'kết quả', visited: 'đã thăm' },
  'en-US': { active: 'current', compare: 'compared', result: 'result', visited: 'visited' },
};
const LABELS: Readonly<Record<string, { vars: string }>> = {
  'vi-VN': { vars: 'Giá trị' },
  'en-US': { vars: 'Values' },
};

/**
 * What the student can read at this frame, as lines: the explanation, the data the picture shows (array,
 * table, graph or tree, written out), the variables, pointers, side lists and the marked cells or nodes.
 * Null when the picture's data cannot be written out: a question the student cannot answer from the text is
 * dropped, not shown half-empty.
 */
function contextOf(frame: Frame<unknown>, visualizer: string, locale: string): string | null {
  const lines = [frame.meta.explanation.trim()];
  if (hasStateReader(visualizer)) {
    const state = readState(visualizer, frame.state, locale);
    if (state === null) return null;
    lines.push(...state);
  }
  const labels = LABELS[locale] ?? LABELS['en-US'];
  const vars = Object.entries(frame.meta.vars ?? {});
  if (vars.length > 0)
    lines.push(`${labels.vars}: ${vars.map(([k, v]) => `${k} = ${v}`).join('; ')}`);
  // a pointer named like a variable only repeats it
  const pointers = Object.entries(frame.meta.pointers ?? {}).filter(
    ([k]) => !(k in (frame.meta.vars ?? {})),
  );
  if (pointers.length > 0) lines.push(pointers.map(([k, v]) => `${k} → ${v}`).join('; '));
  for (const aux of frame.meta.aux ?? []) {
    lines.push(`${aux.label}: ${aux.items.slice(0, MAX_VALUES).join(', ') || '∅'}`);
  }
  // highlight keys are cell or node ids: meaningful for a table, a graph or a tree, noise for an array
  if (visualizer !== 'array' && hasStateReader(visualizer)) {
    const words = KIND_WORDS[locale] ?? KIND_WORDS['en-US'];
    const byKind = new Map<string, string[]>();
    for (const [key, kind] of Object.entries(frame.meta.highlights ?? {})) {
      if (kind in words)
        byKind.set(kind, [...(byKind.get(kind) ?? []), markName(visualizer, key, locale)]);
    }
    for (const [kind, keys] of byKind) {
      const more = keys.length > MAX_MARKS ? ', …' : '';
      lines.push(`${words[kind]}: ${keys.slice(0, MAX_MARKS).join(', ')}${more}`);
    }
  }
  return lines.filter(Boolean).join('\n');
}

const MIN_GIVEAWAY_CHARS = 6;

/** The correct option, word for word, is already in the text the student reads. */
function givesAway(context: string, correct: string): boolean {
  const c = correct.trim().toLowerCase();
  return c.length >= MIN_GIVEAWAY_CHARS && context.toLowerCase().includes(c);
}

function candidatesOf(entry: AnyWalkthroughEntry, locale: string): Candidate[] {
  const defs = new Map(entry.beatDefs.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const answerLabel = msg({ 'vi-VN': 'Đáp án', 'en-US': 'Answer' }, locale);
  for (const preset of entry.presets) {
    const { frames } = presetFrames(entry, preset, locale);
    const occurrences = new Map<string, number>();
    frames.forEach((frame, i) => {
      for (const tag of frame.meta.tags ?? []) {
        if (!tag.startsWith('beat:')) continue;
        const beatId = tag.slice('beat:'.length);
        const occurrence = (occurrences.get(beatId) ?? 0) + 1;
        occurrences.set(beatId, occurrence);
        const def = defs.get(beatId);
        const predict = def?.ask?.predict;
        if (!def || !predict || occurrence > MAX_ASKS_PER_BEAT) continue;
        const answer = predict.answer(frame, frames[i + 1]);
        if (!Number.isInteger(answer) || answer < 0 || answer >= predict.options.length) continue;
        const options = predict.options.slice(0, LETTERS.length).map((o) => msg(o, locale));
        if (answer >= options.length) continue;
        const context = contextOf(frame, entry.visualizer, locale);
        // a question whose context already says the answer would test reading, not understanding
        if (context === null || givesAway(context, options[answer])) continue;
        const question = `${context}\n${msg(def.ask!.text, locale)}`;
        const key = `${beatId}|${question}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const narration = fill(msg(def.narration, locale), frame.meta.vars);
        out.push({
          id: `${entry.id}:${preset.id}:${beatId}:${occurrence}`,
          beatId,
          question,
          options,
          answer,
          analysis: `${answerLabel} ${LETTERS[answer]}: ${options[answer]}. ${narration}`.trim(),
        });
      }
    });
  }
  return out;
}

/** Up to `count` questions, one per beat first so a set covers the lesson, in a seeded order. */
export function buildPractice(entry: AnyWalkthroughEntry, opts: PracticeOptions): QuizQuestion[] {
  const count = opts.count ?? PRACTICE_COUNT;
  const next = prng(opts.seed ?? 1);
  const pool = candidatesOf(entry, opts.locale)
    .map((c) => ({ c, k: next() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c);
  const firstOfBeat = new Set<string>();
  const head: Candidate[] = [];
  const tail: Candidate[] = [];
  for (const c of pool) {
    if (firstOfBeat.has(c.beatId)) tail.push(c);
    else {
      firstOfBeat.add(c.beatId);
      head.push(c);
    }
  }
  return [...head, ...tail].slice(0, count).map((c) => ({
    id: c.id,
    type: 'single',
    question: c.question,
    options: c.options.map((label, i) => ({ label, value: LETTERS[i] })),
    answer: [LETTERS[c.answer]],
    analysis: c.analysis,
    hasAnswer: true,
    points: 1,
  }));
}
