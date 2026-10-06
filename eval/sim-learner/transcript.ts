/**
 * Lesson transcript for the simulated learner (ADR 0014 decisions 5(b) and 7).
 *
 * What a student experiences for one (entry, preset, locale): the teacher lines the provider
 * scripts (ask text, narration with vars filled), each paired with a text description of the
 * frame on screen. Pure: no I/O, no model, no randomness except the explicit `seed` of `degrade`.
 */
import { createWalkthroughProvider, getTutorLabels } from '@/lib/tutor/provider';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';

export interface TranscriptLine {
  /** `ask`: the teacher's question before a beat; `narration`: what the teacher says over it. */
  readonly kind: 'ask' | 'narration';
  readonly text: string;
  /** Text description of the frame shown with this line. */
  readonly frame: string;
}

const FRAME_LABEL: Readonly<Record<string, string>> = { 'vi-VN': 'Khung hình', 'en-US': 'Frame' };

/** `0,1,2,5` -> `0-2, 5`; non-integer keys are kept as they are. */
function compressKeys(keys: readonly string[]): string {
  const nums = keys.every((k) => /^\d+$/.test(k)) ? keys.map(Number).sort((a, b) => a - b) : null;
  if (!nums) return keys.join(', ');
  const runs: string[] = [];
  for (let i = 0; i < nums.length; ) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    runs.push(j > i ? `${nums[i]}-${nums[j]}` : `${nums[i]}`);
    i = j + 1;
  }
  return runs.join(', ');
}

/** Explanation, vars and highlights of one frame as plain text. */
export function describeFrame(frame: Frame<unknown>, total: number, locale: string): string {
  const { meta } = frame;
  const label = FRAME_LABEL[locale] ?? FRAME_LABEL['en-US'];
  const parts = [`${label} ${meta.index + 1}/${total}: ${meta.explanation}`];
  if (meta.vars && Object.keys(meta.vars).length > 0) {
    parts.push(
      `vars: ${Object.entries(meta.vars)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`,
    );
  }
  const byKind = new Map<string, string[]>();
  for (const [key, kind] of Object.entries(meta.highlights ?? {})) {
    byKind.set(kind, [...(byKind.get(kind) ?? []), key]);
  }
  if (byKind.size > 0) {
    parts.push(
      `highlights: ${[...byKind].map(([kind, keys]) => `${kind} [${compressKeys(keys)}]`).join('; ')}`,
    );
  }
  return parts.join(' | ');
}

/**
 * Teacher lines of one preset in lesson order, from the provider's scripted actions
 * (`[ask] -> setState -> narration` per beat) paired with the frame each setState selects.
 */
export function buildTranscript(
  entry: AnyWalkthroughEntry,
  presetId: string,
  locale: string,
): TranscriptLine[] {
  const provider = createWalkthroughProvider({
    findWalkthrough: (id) => (id === entry.id ? entry : undefined),
    getLabels: getTutorLabels,
  });
  const preset = entry.presets.find((p) => p.id === presetId);
  if (!preset) throw new Error(`unknown presetId "${presetId}" for walkthrough "${entry.id}"`);
  const frames = steps(entry, preset.input, { locale });
  const actions = provider.build({ id: entry.id, presetId }, { locale }).actions[0] ?? [];

  const lines: TranscriptLine[] = [];
  let frame = -1;
  let narrated = true; // the narration of the current frame is already emitted
  let ask: string | null = null;
  const show = (i: number) => describeFrame(frames[i], frames.length, locale);
  for (const a of actions) {
    if (a.type === 'widget_setState') {
      frame = Number((a.state as { frame?: unknown }).frame);
      if (!Number.isInteger(frame) || frame < 0 || frame >= frames.length) {
        throw new Error(`setState frame out of range: ${String(frame)}`);
      }
      narrated = false;
      if (ask !== null) lines.push({ kind: 'ask', text: ask, frame: show(frame) });
      ask = null;
    } else if (a.type === 'speech') {
      // ponytail: the provider skips blank narration, so a blank one would shift this pairing
      if (narrated) ask = a.text;
      else {
        lines.push({ kind: 'narration', text: a.text, frame: show(frame) });
        narrated = true;
      }
    }
  }
  return lines;
}

/** The transcript as the text a model reads. */
export function renderTranscript(lines: readonly TranscriptLine[]): string {
  return lines
    .map(
      (l, i) =>
        `${i + 1}. ${l.kind === 'ask' ? 'Teacher asks' : 'Teacher says'}: ${l.text}${l.frame ? `\n   On screen: ${l.frame}` : ''}`,
    )
    .join('\n');
}

/** mulberry32: small seeded PRNG, uniform in [0, 1). */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deliberately bad lesson: steps shuffled out of order, half of them dropped (at least one
 * line stays), and every frame description removed, so the student never sees the values,
 * ranges or highlights on screen. Same input and `seed` give the same output.
 */
export function degrade(lines: readonly TranscriptLine[], seed: number): TranscriptLine[] {
  const rand = prng(seed);
  const out = [...lines];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, Math.max(1, Math.ceil(out.length / 2))).map((l) => ({ ...l, frame: '' }));
}
