/**
 * The student door's lesson: one stage holding the catalog walkthrough and a short practice quiz,
 * built the way `generate_walkthrough` builds its page (same provider, same policy check) but with no
 * agent session. Pure: ids and the clock come in, the document comes out, so the route only persists it.
 */
import type { Scene } from '@/lib/types/stage';
import type { AppDocument } from '@/lib/document-store/persistence-types';
import { msg } from '@/lib/tutor/catalog/messages';
import { buildPractice } from '@/lib/tutor/door/practice';
import { assertScenePolicy } from '@/lib/widgets/policy';
import type { AnyWalkthroughEntry, WidgetProvider } from '@/lib/widgets/types';

export type LessonLocale = 'vi-VN' | 'en-US';
export type LessonMode = 'lesson' | 'practice';

export interface LessonRequest {
  readonly walkthroughId: string;
  readonly presetId?: string;
  readonly locale: LessonLocale;
  readonly mode: LessonMode;
  /** Already cleaned by {@link cleanNickname}. */
  readonly nickname?: string;
}

export interface LessonDeps {
  readonly findWalkthrough: (id: string) => AnyWalkthroughEntry | undefined;
  readonly provider: Pick<WidgetProvider, 'build'>;
  readonly codeAllowed: boolean;
  readonly now: () => number;
  /** A fresh URL-safe token; the caller prefixes it (`stage-`, `scene-wt-`, …). */
  readonly token: () => string;
}

export type LessonResult =
  | { readonly ok: true; readonly stageId: string; readonly document: AppDocument }
  | {
      readonly ok: false;
      readonly error: 'unknown-walkthrough' | 'unknown-preset' | 'build-failed' | 'blocked';
      readonly message: string;
    };

const DIRECTIVE: Record<LessonLocale, string> = {
  'vi-VN': 'Vietnamese (Tiếng Việt)',
  'en-US': 'English',
};
const NICKNAME_MAX = 40;

/** A display name a student typed: control characters out, whitespace collapsed, length capped. */
export function cleanNickname(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? Array.from(text).slice(0, NICKNAME_MAX).join('') : undefined;
}

export function buildLesson(req: LessonRequest, deps: LessonDeps): LessonResult {
  const entry = deps.findWalkthrough(req.walkthroughId);
  if (!entry) {
    return {
      ok: false,
      error: 'unknown-walkthrough',
      message: `Unknown walkthrough "${req.walkthroughId}".`,
    };
  }
  if (req.presetId !== undefined && !entry.presets.some((p) => p.id === req.presetId)) {
    return { ok: false, error: 'unknown-preset', message: `Unknown preset "${req.presetId}".` };
  }

  const stageId = `stage-${deps.token()}`;
  const now = deps.now();
  const title = msg(entry.title, req.locale);
  const scenes: Scene[] = [];
  let order = 1;

  if (req.mode === 'lesson') {
    let built;
    try {
      built = deps.provider.build(
        { id: entry.id, presetId: req.presetId },
        { locale: req.locale, languageDirective: DIRECTIVE[req.locale] },
      );
    } catch (error) {
      return {
        ok: false,
        error: 'build-failed',
        message: `The walkthrough "${entry.id}" could not be built: ${error instanceof Error ? error.message : String(error)}.`,
      };
    }
    const sceneId = `scene-wt-${deps.token()}`;
    const scene = {
      id: sceneId,
      outlineId: sceneId,
      stageId,
      type: 'interactive',
      title,
      order: order++,
      content: built.content,
      actions: built.actions[0] ?? [],
      createdAt: now,
      updatedAt: now,
    } as unknown as Scene;
    const blocked = assertScenePolicy(scene, { codeAllowed: deps.codeAllowed });
    if (blocked) return { ok: false, error: 'blocked', message: blocked.hint };
    scenes.push(scene);
  }

  const practiceTitle = msg({ 'vi-VN': 'Luyện tập', 'en-US': 'Practice' }, req.locale);
  const questions = buildPractice(entry, { locale: req.locale, seed: now });
  if (questions.length > 0) {
    const sceneId = `scene-pr-${deps.token()}`;
    scenes.push({
      id: sceneId,
      outlineId: sceneId,
      stageId,
      type: 'quiz',
      title: `${practiceTitle}: ${title}`,
      order: order++,
      content: { type: 'quiz', questions },
      actions: [],
      createdAt: now,
      updatedAt: now,
    } as unknown as Scene);
  }
  if (scenes.length === 0) {
    return {
      ok: false,
      error: 'build-failed',
      message: `"${entry.id}" has nothing to show in this mode.`,
    };
  }

  const who = req.nickname
    ? `${msg({ 'vi-VN': 'Học sinh', 'en-US': 'Student' }, req.locale)}: ${req.nickname}`
    : undefined;
  return {
    ok: true,
    stageId,
    document: {
      stage: {
        id: stageId,
        name: req.mode === 'practice' ? `${practiceTitle}: ${title}` : title,
        ...(who ? { description: who } : {}),
        languageDirective: DIRECTIVE[req.locale],
        // the AI teacher alone: a lesson is for working through, the classmates are noise (the learner can
        // still pick agents in the classroom, which wins over this default)
        agentIds: ['default-1'],
        createdAt: now,
        updatedAt: now,
      },
      scenes,
      // The same envelope the agent runtime writes: born complete and owned by a server job, so the
      // browser never tries to generate pages into it.
      outline: {
        outlines: [],
        requirement: title,
        generationComplete: true,
        producer: 'server-job',
        producerRef: 'learn-door',
        createdAt: now,
        updatedAt: now,
      },
    } as unknown as AppDocument,
  };
}
