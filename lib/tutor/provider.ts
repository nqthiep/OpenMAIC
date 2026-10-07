/**
 * Provider `walkthrough` (INTERFACES §5, ADR 0006 decisions 2 and 7, ADR 0013 decisions 4-6, 8).
 * Builds the self-contained widget, its scripted actions and the staleness check, all from the
 * catalog. Server-side only: hashing uses node:crypto. Never calls an LLM.
 */
import type { Action, Scene } from '@openmaic/dsl';
import enUS from '@/lib/i18n/locales/en-US.json';
import viVN from '@/lib/i18n/locales/vi-VN.json';
import { entryContentHash, framesHash } from '@/lib/tutor/catalog/hash';
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { Messages } from '@/lib/tutor/catalog/types';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { buildWalkthroughHtml, htmlBytes } from '@/lib/tutor/build/build-html';
import { buildMathTable, katexCss } from '@/lib/tutor/build/katex';
import { getRuntimeJs } from '@/lib/tutor/build/runtimes';
import { renderShell } from '@/lib/tutor/build/shell';
import type {
  BeatRef,
  Panel,
  WalkthroughData,
  WalkthroughWidgetConfig,
} from '@/lib/tutor/protocol/widget-data';
import { isWalkthroughScene } from '@/lib/widgets/policy';
import { describeWalkthrough, readWalkthroughRef } from '@/lib/widgets/describe';
import type {
  AnyWalkthroughEntry,
  BuildRequest,
  BuildResult,
  WidgetContext,
  WidgetProvider,
} from '@/lib/widgets/types';

export const RUNTIME_VERSION = 1;
/** Beats narrated per scene (ADR 0013 decision 4) [Inference]; the rest stay reachable by seeking. */
export const MAX_NARRATED_BEATS = 12;
/** A beat's prediction question is asked on its first N occurrences in a script; later ones are plain narration. */
export const MAX_ASKS_PER_BEAT = 2;

type Preset = AnyWalkthroughEntry['presets'][number];
type WalkthroughSet = WalkthroughData['sets'][string];

// --- labels ---------------------------------------------------------------------------------

/** Runtime label key → `subject.tutor.*` key. */
const LOCALE_KEYS: Readonly<Record<string, string>> = {
  prev: 'prev',
  play: 'play',
  pause: 'pause',
  next: 'next',
  reset: 'reset',
  speed: 'speed',
  preset: 'preset',
  input: 'input',
  apply: 'apply',
  beats: 'beats',
  vars: 'variables',
  pseudo: 'pseudocode',
  cpp: 'cpp',
  py: 'python',
  predict: 'predict',
  skip: 'skip',
};

/** Label keys the locale files do not have (shell aria-labels). */
const EXTRA_LABELS: Readonly<Record<string, Messages>> = {
  controls: { 'vi-VN': 'Điều khiển', 'en-US': 'Controls' },
  frame: { 'vi-VN': 'Bước', 'en-US': 'Frame' },
  aux: { 'vi-VN': 'Dữ liệu phụ', 'en-US': 'Auxiliary data' },
  code: { 'vi-VN': 'Mã', 'en-US': 'Code' },
  correct: { 'vi-VN': 'Đúng rồi!', 'en-US': 'Correct!' },
  incorrect: { 'vi-VN': 'Chưa đúng.', 'en-US': 'Not quite.' },
};

/** Kind labels of the `proofOutline` visualizer; added to a page only when its entry uses that visualizer. */
const PROOF_LABELS: Readonly<Record<string, Messages>> = {
  'proof.given': { 'vi-VN': 'Cho', 'en-US': 'Given' },
  'proof.goal': { 'vi-VN': 'Cần chứng minh', 'en-US': 'To prove' },
  'proof.have': { 'vi-VN': 'Có', 'en-US': 'We have' },
  'proof.because': { 'vi-VN': 'Do', 'en-US': 'Because' },
  'proof.therefore': { 'vi-VN': 'Suy ra', 'en-US': 'Hence' },
  'proof.done': { 'vi-VN': 'Đã xong', 'en-US': 'Done' },
};

type TutorStrings = Readonly<Record<string, string>>;
// Tutor scenes are vi-VN or en-US (Messages carry only these); other locales use en-US.
const TUTOR_STRINGS: Readonly<Record<string, TutorStrings>> = {
  'en-US': enUS.subject.tutor,
  'vi-VN': viVN.subject.tutor,
};

/** `subject.tutor.*` of the locale file, with en-US for a missing locale or key. */
export function getTutorLabels(locale: string): Record<string, string> {
  const base = TUTOR_STRINGS['en-US'];
  const own = Object.hasOwn(TUTOR_STRINGS, locale) ? TUTOR_STRINGS[locale] : base;
  const labels: Record<string, string> = {};
  for (const [key, source] of Object.entries(LOCALE_KEYS)) {
    labels[key] = own[source] ?? base[source] ?? key;
  }
  for (const [key, m] of Object.entries(EXTRA_LABELS)) labels[key] = msg(m, locale);
  return labels;
}

// --- frames ---------------------------------------------------------------------------------

function framesOf(entry: AnyWalkthroughEntry, preset: Preset, locale: string) {
  return steps(entry, preset.input, { locale });
}

/** `framesHash` of one (preset, locale). */
function presetFramesHash(entry: AnyWalkthroughEntry, preset: Preset, locale: string): string {
  return framesHash(framesOf(entry, preset, locale));
}

// --- one preset -----------------------------------------------------------------------------

interface PresetBuild {
  readonly frames: readonly Frame<unknown>[];
  /** In order of appearance; predict beats carry `answer`. */
  readonly beats: readonly BeatRef[];
}

function buildPreset(entry: AnyWalkthroughEntry, preset: Preset, locale: string): PresetBuild {
  const frames = framesOf(entry, preset, locale);
  const defs = new Map(entry.beatDefs.map((d) => [d.id, d]));
  const seen = new Map<string, number>();
  const beats: BeatRef[] = [];
  frames.forEach((frame, i) => {
    for (const tag of frame.meta.tags ?? []) {
      if (!tag.startsWith('beat:')) continue;
      const id = tag.slice('beat:'.length);
      const def = defs.get(id);
      if (!def) throw new Error(`unknown beat "${id}" in preset "${preset.id}"`);
      const occurrence = (seen.get(id) ?? 0) + 1;
      seen.set(id, occurrence);
      const ref: BeatRef = { id, occurrence, frame: i };
      const predict = def.ask?.predict;
      if (predict) {
        const answer = predict.answer(frame, frames[i + 1]);
        if (!Number.isInteger(answer) || answer < 0 || answer >= predict.options.length) {
          throw new Error(`beat "${id}" in preset "${preset.id}": answer ${answer} out of range`);
        }
        ref.answer = answer;
      }
      beats.push(ref);
    }
  });
  return { frames, beats };
}

/**
 * Beats to narrate: all of them up to the cap; beyond it the first `MAX - 1` plus the last
 * occurrence of every `required` beat not already among them (frame order), so a required beat
 * is never silently dropped.
 */
export function narratedBeats(
  beats: readonly BeatRef[],
  required: ReadonlySet<string>,
): readonly BeatRef[] {
  if (beats.length <= MAX_NARRATED_BEATS) return beats;
  const head = beats.slice(0, MAX_NARRATED_BEATS - 1);
  const last = new Map<string, BeatRef>();
  for (const b of beats) if (required.has(b.id)) last.set(b.id, b);
  const extra = [...last.values()].filter((b) => !head.includes(b));
  const keep = new Set([...head, ...extra]);
  return beats.filter((b) => keep.has(b));
}

/** Per beat: `[ask] → setState → narration` (ADR 0006 decision 2). Ids are deterministic. */
function actionsFor(
  entry: AnyWalkthroughEntry,
  presetId: string,
  locale: string,
  built: PresetBuild,
): Action[] {
  const defs = new Map(entry.beatDefs.map((d) => [d.id, d]));
  const out: Action[] = [];
  const nextId = () => `wt-${presetId}-${out.length + 1}`;
  const speak = (text: string) => {
    if (text.trim() !== '') out.push({ id: nextId(), type: 'speech', text });
  };
  for (const ref of narratedOf(entry, built)) {
    const def = defs.get(ref.id)!; // buildPreset rejected unknown beats
    const asks = def.ask && ref.occurrence <= MAX_ASKS_PER_BEAT ? def.ask : undefined;
    if (asks) speak(msg(asks.text, locale));
    out.push({
      id: nextId(),
      type: 'widget_setState',
      state: {
        preset: presetId,
        frame: ref.frame,
        playing: false,
        ...(asks?.predict && { predict: { beatId: ref.id } }),
      },
    });
    speak(fill(msg(def.narration, locale), built.frames[ref.frame].meta.vars));
  }
  return out;
}

function narratedOf(entry: AnyWalkthroughEntry, built: PresetBuild): readonly BeatRef[] {
  const required = new Set(entry.beatDefs.filter((d) => d.required).map((d) => d.id));
  return narratedBeats(built.beats, required);
}

/**
 * Shape (INTERFACES §5 `lessonKit`, leader updates the doc): `pitfalls` keep their `lang`;
 * `hints` = the light (first) hint of each distinct narrated beat, localized.
 */
function lessonKitOf(entry: AnyWalkthroughEntry, locale: string, narrated: readonly BeatRef[]) {
  const t = (m: Messages) => msg(m, locale);
  const p = entry.problem;
  if (!p && !entry.pitfalls?.length) return undefined;
  return {
    statement: p ? t(p.statement) : '',
    constraints: (p?.constraints ?? []).map(t),
    subtasks: (p?.subtasks ?? []).map((s) => ({
      id: s.id,
      limit: t(s.limit),
      idea: t(s.idea),
      complexity: s.complexity,
    })),
    pitfalls: (entry.pitfalls ?? []).map((x) => ({
      text: t(x.text),
      ...(x.lang && { lang: x.lang }),
    })),
    hints: hintsOf(entry, locale, narrated),
    homework: (p?.homework ?? []).map((h) => ({ ...h })),
  };
}

function hintsOf(entry: AnyWalkthroughEntry, locale: string, narrated: readonly BeatRef[]) {
  const defs = new Map(entry.beatDefs.map((d) => [d.id, d]));
  const hints: string[] = [];
  for (const id of new Set(narrated.map((b) => b.id))) {
    const light = defs.get(id)?.hints?.[0];
    if (light) hints.push(msg(light, locale));
  }
  return hints;
}

// --- provider -------------------------------------------------------------------------------

export interface WalkthroughProviderDeps {
  findWalkthrough(id: string): AnyWalkthroughEntry | undefined;
  /** Keys of the runtime/shell labels; missing keys are filled from `getTutorLabels`. */
  getLabels(locale: string): Record<string, string>;
}

export function createWalkthroughProvider(
  deps: WalkthroughProviderDeps,
): WidgetProvider & { isStale(scene: Scene): boolean } {
  const find = (id: string): AnyWalkthroughEntry => {
    const entry = deps.findWalkthrough(id);
    if (!entry) throw new Error(`unknown walkthroughId "${id}"`);
    return entry;
  };

  return {
    id: 'walkthrough',

    claimsScene: (scene) => isWalkthroughScene(scene),

    build(req: BuildRequest, ctx: WidgetContext): BuildResult {
      const entry = find(req.id);
      if (req.input !== undefined) throw new Error('walkthrough input is not enabled before 1d');
      const { locale } = ctx;
      const presetId = req.presetId ?? entry.presets[0].id;
      if (!entry.presets.some((p) => p.id === presetId)) {
        throw new Error(`unknown presetId "${presetId}" for walkthrough "${entry.id}"`);
      }
      const runtimeJs = getRuntimeJs(entry.visualizer);
      if (runtimeJs === null) throw new Error(`no runtime for visualizer "${entry.visualizer}"`);

      const panels: Panel[] = ['pseudo'];
      if (entry.code.impl.cpp.length > 0) panels.push('cpp');
      if (entry.code.impl.py.length > 0) panels.push('py');
      const panel: Panel = req.panel && panels.includes(req.panel) ? req.panel : 'pseudo';

      const built = new Map(entry.presets.map((p) => [p.id, buildPreset(entry, p, locale)]));
      const current = built.get(presetId)!;
      const t = (m: Messages) => msg(m, locale);
      const labels = {
        ...getTutorLabels(locale),
        ...(entry.visualizer === 'proofOutline'
          ? Object.fromEntries(Object.entries(PROOF_LABELS).map(([k, v]) => [k, msg(v, locale)]))
          : {}),
        ...deps.getLabels(locale),
      };
      const title = t(entry.title);
      const plainBeats = (beats: readonly BeatRef[]): BeatRef[] =>
        beats.map(({ id, occurrence, frame }) => ({ id, occurrence, frame }));

      const config: WalkthroughWidgetConfig = {
        type: 'simulation',
        kind: 'walkthrough',
        walkthroughId: entry.id,
        entryRev: entry.entryRev,
        contentHash: entryContentHash(entry),
        subject: entry.subject,
        visualizer: entry.visualizer,
        locale,
        presetId,
        panel,
        presets: entry.presets.map((p) => {
          const b = built.get(p.id)!;
          return {
            id: p.id,
            label: t(p.label),
            total: b.frames.length,
            framesHash: framesHash(b.frames),
          };
        }),
        beats: plainBeats(current.beats),
        runtimeVersion: RUNTIME_VERSION,
      };

      const data: WalkthroughData = {
        title,
        locale,
        sets: Object.fromEntries(
          entry.presets.map((p) => {
            const b = built.get(p.id)!;
            // engine Frame (readonly) and the protocol Frame describe the same JSON
            const frames = [...b.frames] as unknown as WalkthroughSet['frames'];
            return [p.id, { frames, beats: [...b.beats] }];
          }),
        ),
        beatText: Object.fromEntries(
          entry.beatDefs.map((d) => [
            d.id,
            {
              label: t(d.label),
              ...(d.ask && { ask: t(d.ask.text) }),
              ...(d.ask?.predict && { options: d.ask.predict.options.map(t) }),
            },
          ]),
        ),
        code: {
          pseudo: [...entry.code.pseudo],
          impl: { cpp: [...entry.code.impl.cpp], py: [...entry.code.impl.py] },
          map: {
            cpp: Object.fromEntries(
              Object.entries(entry.code.map.cpp).map(([k, v]) => [k, [...v]]),
            ),
            py: Object.fromEntries(Object.entries(entry.code.map.py).map(([k, v]) => [k, [...v]])),
          },
        },
        labels,
      };
      // formulas (`\\( tex \\)` in a frame's explanation or state) are rendered here, once per distinct tex
      const math = buildMathTable(
        Object.values(data.sets).flatMap((set) =>
          set.frames.map((frame) => [frame.meta.explanation, frame.state]),
        ),
      );
      const hasMath = Object.keys(math).length > 0;
      if (hasMath) data.math = { ...math };

      const html = buildWalkthroughHtml({
        config,
        data,
        runtimeJs,
        ...(hasMath ? { extraCss: katexCss() } : {}),
        // custom input UI arrives with 1d (ADR 0013 decision 9)
        shell: renderShell({ title, labels, customInput: false, lang: locale, panels }),
      });
      if (htmlBytes(html) > entry.maxBytes) throw new Error('walkthrough-too-large');

      return {
        content: {
          type: 'interactive',
          html,
          widgetType: 'simulation',
          widgetConfig: { ...config },
        },
        actions: [actionsFor(entry, presetId, locale, current)],
        lessonKit: lessonKitOf(entry, locale, narratedOf(entry, current)),
      };
    },

    actions(scene, ctx) {
      const ref = readWalkthroughRef(scene);
      if (!ref) throw new Error('not a walkthrough scene');
      const entry = find(ref.walkthroughId);
      const preset = entry.presets.find((p) => p.id === ref.presetId);
      if (!preset) return []; // the preset is gone from the catalog: stale scene, nothing to script
      const locale = ref.locale || ctx.locale;
      return actionsFor(entry, preset.id, locale, buildPreset(entry, preset, locale));
    },

    describe: (scene, runtime) => describeWalkthrough(scene, runtime, deps),

    isStale(scene) {
      const ref = readWalkthroughRef(scene);
      const entry = ref && deps.findWalkthrough(ref.walkthroughId);
      if (!ref || !entry) return true;
      if (!entry.presets.some((p) => p.id === ref.presetId)) return true;
      if (ref.entryRev !== entry.entryRev || ref.contentHash !== entryContentHash(entry)) {
        return true;
      }
      if (ref.presets.length !== entry.presets.length) return true;
      return entry.presets.some(
        (p) =>
          ref.presets.find((r) => r.id === p.id)?.framesHash !==
          presetFramesHash(entry, p, ref.locale),
      );
    },
  };
}
