import { createHash } from 'node:crypto';
import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';

import { isDeepStrictEqual } from 'node:util';

import { putSceneBringingCurrent } from './document-writes';
import { noDocument, SUPPORTED_SCENE_TYPES } from './generation-tools';
import { COURSE_STAGE_ID_DESCRIPTION } from './course-stage';
import type { CourseToolDeps } from './course-tools';
import { runStageMutation } from './mutation-fence';

import { isCodeWidgetAllowed } from '@/lib/config/feature-flags';
import { resolveLocale } from '@/lib/tutor/locale';
import type { Scene } from '@/lib/types/stage';
import {
  assertScenePolicy,
  isWalkthroughScene,
  walkthroughProvider,
  widgetRegistry,
} from '@/lib/widgets';

/**
 * `generate_walkthrough` (INTERFACES §3, ADR 0011): builds a walkthrough page from the catalog.
 * Deterministic, never calls an LLM.
 */

function sceneIdFor(sessionId: string | undefined, callId: string) {
  const hash = createHash('sha256')
    .update(`${sessionId ?? ''}\0${callId}`)
    .digest('hex')
    .slice(0, 16);
  return `scene-wt-${hash}`;
}

function result(text: string, details: Record<string, unknown>, isError = false) {
  return { content: [{ type: 'text' as const, text }], details, ...(isError ? { isError } : {}) };
}

function fail(error: string, text: string, extra: Record<string, unknown> = {}) {
  return result(text, { error, ...extra }, true);
}

export const WALKTHROUGH_TOOL_NAME = 'generate_walkthrough';

// ponytail: in-memory (per process) and capped; a restart falls back to the identical-content check
const REPLAY_CAP = 1000;
const replayed = new Map<string, string>();
function remember(key: string, sceneId: string) {
  replayed.delete(key);
  replayed.set(key, sceneId);
  if (replayed.size > REPLAY_CAP) replayed.delete(replayed.keys().next().value as string);
}

export function buildWalkthroughTool(deps: CourseToolDeps) {
  const ids = widgetRegistry.walkthroughIds();
  const Params = Type.Object({
    stageId: Type.String({ description: COURSE_STAGE_ID_DESCRIPTION }),
    order: Type.Integer({ minimum: 1 }),
    title: Type.String({ minLength: 1 }),
    walkthroughId: Type.Union(
      ids.map((id) => Type.Literal(id)),
      { description: 'Which catalog walkthrough to build.' },
    ),
    presetId: Type.Optional(
      Type.String({ description: 'Preset to show first; defaults to the first preset.' }),
    ),
    panel: Type.Optional(
      Type.Union([Type.Literal('pseudo'), Type.Literal('cpp'), Type.Literal('py')]),
    ),
    locale: Type.Optional(Type.Union([Type.Literal('vi-VN'), Type.Literal('en-US')])),
    input: Type.Optional(Type.Unknown({ description: 'Custom input; not enabled yet.' })),
  });

  const tool: AgentTool<typeof Params> = {
    name: WALKTHROUGH_TOOL_NAME,
    label: 'Generate walkthrough page',
    description:
      'Build and persist one step-by-step walkthrough page from the catalog, with a scripted narration and no LLM call. Reusing an order replaces that page. Replaying the same tool call is idempotent.',
    parameters: Params,
    async execute(callId, params, signal) {
      const entry = widgetRegistry.findWalkthrough(params.walkthroughId);
      if (!entry) {
        return fail('invalid-walkthrough-id', `Unknown walkthroughId "${params.walkthroughId}".`, {
          validIds: ids,
        });
      }
      if (params.presetId !== undefined && !entry.presets.some((p) => p.id === params.presetId)) {
        return fail('invalid-preset-id', `Unknown presetId "${params.presetId}".`, {
          validPresetIds: entry.presets.map((p) => p.id),
        });
      }
      if (params.input !== undefined && params.presetId !== undefined) {
        return fail('input-and-preset', 'Send either presetId or input, not both.');
      }
      if (params.input !== undefined) {
        // ponytail: custom input arrives with slice 1d; until then it is always refused
        return fail('invalid-input', 'Custom input is not enabled yet.', {
          issues: ['input-not-enabled'],
        });
      }
      const title = params.title.trim();
      if (!Number.isInteger(params.order) || params.order < 1) {
        return fail('invalid-order', 'generate_walkthrough needs a 1-based integer page order.');
      }
      if (!title) return fail('invalid-title', 'generate_walkthrough needs a non-empty title.');

      const doc = await deps.store.loadDocument(params.stageId);
      if (!doc) return noDocument();
      const sceneId = sceneIdFor(deps.sessionId, callId);
      const replayKey = `${deps.sessionId ?? ''}\0${callId}`;

      // same guards and error shapes as generate_scene: never destroy a page this tool cannot rebuild
      const existing = doc.scenes.find((scene) => scene.order === params.order);
      if (existing && !SUPPORTED_SCENE_TYPES.has(existing.type)) {
        return result(
          `Page ${params.order} has unsupported type "${existing.type}" and was left unchanged.`,
          { blocked: 'unsupported-type', sceneId: existing.id, type: existing.type },
          true,
        );
      }
      if (existing?.type === 'pbl') {
        return result(
          'The existing page is a PBL project. Delete it first or regenerate it as pbl; changing its type here would destroy the project.',
          { blocked: 'pbl-type-change', sceneId: existing.id, type: existing.type },
          true,
        );
      }

      const languageDirective = doc.stage.languageDirective;
      let built;
      try {
        built = walkthroughProvider.build(
          {
            id: params.walkthroughId,
            presetId: params.presetId,
            panel: params.panel,
          },
          {
            locale: params.locale ?? resolveLocale(languageDirective),
            ...(languageDirective ? { languageDirective } : {}),
          },
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'walkthrough-too-large') {
          return fail('walkthrough-too-large', 'The walkthrough page exceeds its size limit.');
        }
        // the other errors come from the catalog entry itself (too many formulas, a beat or answer that does not
        // exist, no runtime): a structured result lets the agent pick another walkthrough instead of crashing
        return fail(
          'walkthrough-build-failed',
          `The walkthrough "${params.walkthroughId}" could not be built: ${error instanceof Error ? error.message : String(error)}.`,
        );
      }
      const content = built.content;
      const beats =
        !Array.isArray(content) && content.widgetConfig
          ? ((content.widgetConfig as { beats?: unknown }).beats ?? [])
          : [];

      // replay: a fresh order keeps the deterministic id; a replaced order keeps the old page id, so
      // match the call id remembered for this process, or an already-identical walkthrough page
      const mapped = replayed.get(replayKey);
      const replay =
        doc.scenes.find((scene) => scene.id === sceneId) ??
        (existing &&
        isWalkthroughScene(existing) &&
        (mapped === existing.id ||
          (existing.title === title && isDeepStrictEqual(existing.content, content)))
          ? existing
          : undefined);
      if (replay) {
        return result('This walkthrough page was already created. Nothing changed.', {
          sceneId: replay.id,
          order: replay.order,
          beats,
          lessonKit: built.lessonKit,
          replay: true,
        });
      }

      // an occupied order is replaced in place, keeping that page's id (as generate_scene does)
      const now = Date.now();
      const scene = {
        id: existing?.id ?? sceneId,
        outlineId: existing?.outlineId ?? sceneId,
        stageId: params.stageId,
        type: 'interactive',
        title,
        order: params.order,
        content,
        actions: built.actions[0] ?? [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      } as unknown as Scene;

      const blocked = assertScenePolicy(scene, { codeAllowed: isCodeWidgetAllowed() });
      if (blocked) return fail(blocked.error, blocked.hint, { hint: blocked.hint });

      await runStageMutation(signal, () =>
        putSceneBringingCurrent(deps.store, params.stageId, scene),
      );
      remember(replayKey, scene.id);
      deps.onCheckpoint({
        tool: 'generate_walkthrough',
        stageId: params.stageId,
        sceneId: scene.id,
        order: scene.order,
        title: scene.title,
        sceneType: scene.type,
        detail: `walkthrough ${params.walkthroughId} persisted`,
      });
      return result(`Walkthrough page ${scene.order} "${scene.title}" persisted.`, {
        sceneId: scene.id,
        order: scene.order,
        beats,
        lessonKit: built.lessonKit,
      });
    },
  };
  return tool;
}
