import { createHash } from 'node:crypto';
import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';

import { putSceneBringingCurrent } from './document-writes';
import { noDocument } from './generation-tools';
import { COURSE_STAGE_ID_DESCRIPTION } from './course-stage';
import type { CourseToolDeps } from './course-tools';
import { runStageMutation } from './mutation-fence';

import { clipProvider, clipRegistry } from '@/lib/clips';
import type { ClipRegistry } from '@/lib/clips/registry';
import { isCodeWidgetAllowed } from '@/lib/config/feature-flags';
import { msg } from '@/lib/tutor/catalog/messages';
import { resolveLocale } from '@/lib/tutor/locale';
import type { Scene } from '@/lib/types/stage';
import { assertScenePolicy, type WidgetProvider } from '@/lib/widgets';

/**
 * `generate_clip_scenes` (INTERFACES §3, ADR 0011): inserts one slide per chapter of a pre-rendered
 * clip after page `afterOrder`, later pages shift down. Deterministic, never calls an LLM.
 * Not registered in the toolset yet (task I-08).
 */

export const CLIP_TOOL_NAME = 'generate_clip_scenes';

function sceneIdFor(sessionId: string | undefined, callId: string, chapterId: string) {
  const hash = createHash('sha256')
    .update(`${sessionId ?? ''}\0${callId}\0${chapterId}`)
    .digest('hex')
    .slice(0, 16);
  return `scene-clip-${hash}`;
}

function result(text: string, details: Record<string, unknown>, isError = false) {
  return { content: [{ type: 'text' as const, text }], details, ...(isError ? { isError } : {}) };
}

function fail(error: string, text: string, extra: Record<string, unknown> = {}) {
  return result(text, { error, ...extra }, true);
}

export interface ClipToolSeams {
  registry?: ClipRegistry;
  provider?: WidgetProvider;
}

export function buildClipTool(deps: CourseToolDeps, seams: ClipToolSeams = {}) {
  const registry = seams.registry ?? clipRegistry;
  const provider = seams.provider ?? clipProvider;
  const ids = registry.clipIds();
  const Params = Type.Object({
    stageId: Type.String({ description: COURSE_STAGE_ID_DESCRIPTION }),
    afterOrder: Type.Integer({
      minimum: 0,
      description:
        'Insert after this 1-based page order; 0 inserts at the start. Later pages shift down.',
    }),
    clipId:
      ids.length > 0
        ? Type.Union(
            ids.map((id) => Type.Literal(id)),
            { description: 'Which catalog clip to insert.' },
          )
        : Type.String({ description: 'No clip is in the catalog yet; every id is refused.' }),
    presetId: Type.Optional(
      Type.String({ description: 'Preset to show; defaults to the first preset.' }),
    ),
    locale: Type.Optional(Type.Union([Type.Literal('vi-VN'), Type.Literal('en-US')])),
  });

  const tool: AgentTool<typeof Params> = {
    name: CLIP_TOOL_NAME,
    label: 'Insert clip pages',
    description:
      'Insert one page per chapter of a pre-rendered math clip after a given page, with scripted narration and no LLM call. Replaying the same tool call is idempotent.',
    parameters: Params,
    async execute(callId, params, signal) {
      const entry = registry.findClip(params.clipId);
      if (!entry) {
        return fail('invalid-clip-id', `Unknown clipId "${params.clipId}".`, { validIds: ids });
      }
      if (params.presetId !== undefined && !entry.presets.some((p) => p.id === params.presetId)) {
        return fail('invalid-preset-id', `Unknown presetId "${params.presetId}".`, {
          validPresetIds: entry.presets.map((p) => p.id),
        });
      }
      if (!Number.isInteger(params.afterOrder) || params.afterOrder < 0) {
        return fail('invalid-order', 'generate_clip_scenes needs an integer afterOrder >= 0.');
      }

      const doc = await deps.store.loadDocument(params.stageId);
      if (!doc) return noDocument();
      const locale = params.locale ?? resolveLocale(doc.stage.languageDirective);

      let built;
      try {
        built = provider.build(
          { id: params.clipId, presetId: params.presetId },
          {
            locale,
            ...(doc.stage.languageDirective
              ? { languageDirective: doc.stage.languageDirective }
              : {}),
          },
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'clip-not-prebuilt') {
          return fail('clip-not-prebuilt', 'This clip has not been rendered yet.');
        }
        throw error;
      }
      const slides = Array.isArray(built.content) ? built.content : [];
      const sceneIds = entry.chapters.map((c) => sceneIdFor(deps.sessionId, callId, c.id));

      // replay: the first chapter's deterministic id is already in the document
      const replay = doc.scenes.find((s) => s.id === sceneIds[0]);
      if (replay) {
        const orders = sceneIds.map((id) => doc.scenes.find((s) => s.id === id)?.order);
        return result('These clip pages were already inserted. Nothing changed.', {
          sceneIds,
          orders,
          replay: true,
        });
      }

      const now = Date.now();
      const created = slides.map((content, i) => {
        const chapter = entry.chapters[i];
        return {
          id: sceneIds[i],
          outlineId: sceneIds[i],
          stageId: params.stageId,
          type: 'slide',
          title: msg(chapter.label, locale),
          order: params.afterOrder + 1 + i,
          content,
          actions: built.actions[i] ?? [],
          createdAt: now,
          updatedAt: now,
        } as unknown as Scene;
      });
      for (const scene of created) {
        const blocked = assertScenePolicy(scene, { codeAllowed: isCodeWidgetAllowed() });
        if (blocked) return fail(blocked.error, blocked.hint, { hint: blocked.hint });
      }

      // later pages move down by the number of inserted pages; last page first so orders never collide
      const shifted = doc.scenes
        .filter((s) => s.order > params.afterOrder)
        .sort((a, b) => b.order - a.order)
        .map((s) => ({ ...s, order: s.order + created.length, updatedAt: now }) as Scene);
      await runStageMutation(signal, async () => {
        for (const scene of shifted)
          await putSceneBringingCurrent(deps.store, params.stageId, scene);
        for (const scene of created)
          await putSceneBringingCurrent(deps.store, params.stageId, scene);
      });
      for (const scene of created) {
        deps.onCheckpoint({
          tool: CLIP_TOOL_NAME,
          stageId: params.stageId,
          sceneId: scene.id,
          order: scene.order,
          title: scene.title,
          sceneType: scene.type,
          detail: `clip ${params.clipId} page persisted`,
        });
      }
      return result(`Inserted ${created.length} clip page(s) after page ${params.afterOrder}.`, {
        sceneIds,
        orders: created.map((s) => s.order),
      });
    },
  };
  return tool;
}
