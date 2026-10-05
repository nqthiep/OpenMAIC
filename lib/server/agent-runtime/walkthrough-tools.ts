import { createHash } from 'node:crypto';
import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';

import { putSceneBringingCurrent } from './document-writes';
import { COURSE_STAGE_ID_DESCRIPTION } from './course-stage';
import type { CourseToolDeps } from './course-tools';
import { runStageMutation } from './mutation-fence';

import { isCodeWidgetAllowed } from '@/lib/config/feature-flags';
import { resolveLocale } from '@/lib/tutor/locale';
import type { Scene } from '@/lib/types/stage';
import { assertScenePolicy, walkthroughProvider, widgetRegistry } from '@/lib/widgets';

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
      if (!Number.isInteger(params.order) || params.order < 1 || !title) {
        return fail('invalid-order', 'generate_walkthrough needs a 1-based order and a title.');
      }

      const doc = await deps.store.loadDocument(params.stageId);
      if (!doc) return result('No course document yet. Call create_stage first.', {}, true);
      const sceneId = sceneIdFor(deps.sessionId, callId);

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
        throw error;
      }
      const content = built.content;
      const beats =
        !Array.isArray(content) && content.widgetConfig
          ? ((content.widgetConfig as { beats?: unknown }).beats ?? [])
          : [];

      const replay = doc.scenes.find((scene) => scene.id === sceneId);
      if (replay) {
        return result('This walkthrough page was already created. Nothing changed.', {
          sceneId,
          order: replay.order,
          beats,
          lessonKit: built.lessonKit,
          replay: true,
        });
      }

      // an occupied order is replaced in place, keeping that page's id (as generate_scene does)
      const existing = doc.scenes.find((scene) => scene.order === params.order);
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
