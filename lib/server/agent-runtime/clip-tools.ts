import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';

import { putSceneBringingCurrent } from './document-writes';
import { noDocument } from './generation-tools';
import { COURSE_STAGE_ID_DESCRIPTION } from './course-stage';
import type { CourseToolDeps } from './course-tools';
import { runStageMutation } from './mutation-fence';
import { runClipRenderJob, type ClipRenderJob } from './clip-render';
import { registerPendingMedia } from './pending-media';

import { clipAssetKey } from '@/lib/clips/assets';
import { clipProvider, clipRegistry } from '@/lib/clips';
import { nearestPreset } from '@/lib/clips/nearest';
import { createClipProvider } from '@/lib/clips/provider';
import type { ClipRegistry } from '@/lib/clips/registry';
import { getRuntimeAsset } from '@/lib/clips/runtime-index';
import { createManimClient, type ManimClient } from '@/lib/clips/service-client';
import type { AnyClipEntry, ClipAsset } from '@/lib/clips/types';
import { validateClipInput } from '@/lib/clips/validate';
import { getManimServiceConfig, isCodeWidgetAllowed } from '@/lib/config/feature-flags';
import { msg } from '@/lib/tutor/catalog/messages';
import { resolveLocale } from '@/lib/tutor/locale';
import type { Scene } from '@/lib/types/stage';
import { assertScenePolicy, type BuildResult, type WidgetProvider } from '@/lib/widgets';

/**
 * `generate_clip_scenes` (INTERFACES §3, ADR 0011): inserts one slide per chapter of a clip after page `afterOrder`;
 * later pages shift down. With `presetId` the clip must already be rendered. With `params` (task 3C-08) a clip that is
 * not in the cache is rendered on demand by the manim-service: the pages are inserted at once with placeholder videos
 * (`gen_vid_…`, like `generate_video`), a detached job polls, stores the files and swaps the placeholders, and
 * `media_ready` reports the outcome. Never calls an LLM.
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

/** What the on-demand branch needs besides the course tool dependencies; all of it can be replaced in tests. */
export interface ClipRenderDeps {
  /** owner-bound document store that is NOT fenced by the run lease: the job patches pages minutes after the run ended */
  backgroundStore?: ClipRenderJob['backgroundStore'];
  emitMediaReady?: ClipRenderJob['emitMediaReady'];
  manimClient?: ManimClient;
  getManimConfig?: () => { url: string; token: string } | null;
  /** the owner id sent to the service as `x-openmaic-client` (default: the session id) */
  ownerId?: string;
  put?: ClipRenderJob['put'];
  record?: ClipRenderJob['record'];
  patch?: ClipRenderJob['patch'];
  pollMs?: number;
  timeoutMs?: number;
  /** test seam: the cache of clips rendered on demand */
  lookupRuntimeAsset?: (key: string) => Promise<ClipAsset | null>;
}

export function buildClipTool(deps: CourseToolDeps & ClipRenderDeps, seams: ClipToolSeams = {}) {
  const registry = seams.registry ?? clipRegistry;
  const provider = seams.provider ?? clipProvider;
  const getConfig = deps.getManimConfig ?? getManimServiceConfig;
  const lookupRuntime = deps.lookupRuntimeAsset ?? ((key: string) => getRuntimeAsset(key));
  // Without the service only a clip that has been rendered can be inserted; with it any catalog clip can be asked for
  // by `params` (and a not-yet-rendered one by preset still answers `clip-not-prebuilt`).
  const ids = getConfig() ? registry.clipIds() : registry.prebuiltIds();
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
    params: Type.Optional(
      Type.Unknown({
        description:
          'Free parameters of the clip (numbers and choices, like a preset input) instead of presetId. A clip that is not rendered yet is rendered in the background and its pages show a placeholder meanwhile.',
      }),
    ),
    locale: Type.Optional(Type.Union([Type.Literal('vi-VN'), Type.Literal('en-US')])),
  });

  /** Writes the slides as pages after `afterOrder` and shifts the later pages; returns the ids and orders. */
  async function insertPages(
    toolParams: { stageId: string; afterOrder: number },
    doc: NonNullable<Awaited<ReturnType<CourseToolDeps['store']['loadDocument']>>>,
    entry: AnyClipEntry,
    built: BuildResult,
    sceneIds: string[],
    locale: string,
    signal: AbortSignal | undefined,
    detail: string,
  ) {
    const slides = Array.isArray(built.content) ? built.content : [];
    const now = Date.now();
    const created = slides.map((content, i) => {
      const chapter = entry.chapters[i];
      return {
        id: sceneIds[i],
        outlineId: sceneIds[i],
        stageId: toolParams.stageId,
        type: 'slide',
        title: msg(chapter.label, locale),
        order: toolParams.afterOrder + 1 + i,
        content,
        actions: built.actions[i] ?? [],
        createdAt: now,
        updatedAt: now,
      } as unknown as Scene;
    });
    for (const scene of created) {
      const blocked = assertScenePolicy(scene, { codeAllowed: isCodeWidgetAllowed() });
      if (blocked) {
        return {
          ok: false as const,
          failure: fail(blocked.error, blocked.hint, { hint: blocked.hint }),
        };
      }
    }
    // later pages move down by the number of inserted pages; last page first so orders never collide
    const shifted = doc.scenes
      .filter((s) => s.order > toolParams.afterOrder)
      .sort((a, b) => b.order - a.order)
      .map((s) => ({ ...s, order: s.order + created.length, updatedAt: now }) as Scene);
    await runStageMutation(signal, async () => {
      for (const scene of shifted)
        await putSceneBringingCurrent(deps.store, toolParams.stageId, scene);
      for (const scene of created)
        await putSceneBringingCurrent(deps.store, toolParams.stageId, scene);
    });
    for (const scene of created) {
      deps.onCheckpoint({
        tool: CLIP_TOOL_NAME,
        stageId: toolParams.stageId,
        sceneId: scene.id,
        order: scene.order,
        title: scene.title,
        sceneType: scene.type,
        detail,
      });
    }
    return { ok: true as const, orders: created.map((s) => s.order) };
  }

  const tool: AgentTool<typeof Params> = {
    name: CLIP_TOOL_NAME,
    label: 'Insert clip pages',
    description:
      'Insert one page per chapter of a math clip after a given page, with scripted narration and no LLM call. Use presetId for a ready-made variant, or params for your own numbers: a clip that is not rendered yet is rendered in the background (pages show a placeholder, a media_ready event reports the outcome; do not wait and do not retry while one is pending). Replaying the same tool call is idempotent.',
    parameters: Params,
    async execute(callId, params, signal): Promise<ReturnType<typeof result>> {
      const entry = registry.findClip(params.clipId);
      if (!entry) {
        return fail('invalid-clip-id', `Unknown clipId "${params.clipId}".`, { validIds: ids });
      }
      if (params.params !== undefined && params.presetId !== undefined) {
        return fail('params-and-preset', 'Send either presetId or params, not both.');
      }
      if (params.presetId !== undefined && !entry.presets.some((p) => p.id === params.presetId)) {
        return fail('invalid-preset-id', `Unknown presetId "${params.presetId}".`, {
          validPresetIds: entry.presets.map((p) => p.id),
        });
      }
      if (!Number.isInteger(params.afterOrder) || params.afterOrder < 0) {
        return fail('invalid-order', 'generate_clip_scenes needs an integer afterOrder >= 0.');
      }

      let input: unknown;
      if (params.params !== undefined) {
        const checked = validateClipInput(entry, params.params);
        if (!checked.ok)
          return fail('invalid-params', 'The parameters are not valid for this clip.', {
            issues: checked.issues,
          });
        input = checked.value;
      }

      const doc = await deps.store.loadDocument(params.stageId);
      if (!doc) return noDocument();
      const locale = params.locale ?? resolveLocale(doc.stage.languageDirective);
      const ctx = {
        locale,
        ...(doc.stage.languageDirective ? { languageDirective: doc.stage.languageDirective } : {}),
      };
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

      // --- a preset: the clip must already be rendered ---------------------------------------------------------
      if (input === undefined) {
        let built: BuildResult;
        try {
          built = provider.build({ id: params.clipId, presetId: params.presetId }, ctx);
        } catch (error) {
          if (error instanceof Error && error.message === 'clip-not-prebuilt') {
            return fail('clip-not-prebuilt', 'This clip has not been rendered yet.');
          }
          throw error;
        }
        const done = await insertPages(
          params,
          doc,
          entry,
          built,
          sceneIds,
          locale,
          signal,
          `clip ${params.clipId} page persisted`,
        );
        if (!done.ok) return done.failure;
        return result(
          `Inserted ${done.orders.length} clip page(s) after page ${params.afterOrder}.`,
          { sceneIds, orders: done.orders },
        );
      }

      // --- free parameters: cache first, then the render service ---------------------------------------------------
      const key = clipAssetKey(entry, input, locale);
      const cached = entry.asset(input as never, locale) ?? (await lookupRuntime(key));
      const buildWith = (asset: ClipAsset) =>
        createClipProvider({ findClip: () => ({ ...entry, asset: () => asset }) }).build(
          { id: entry.id, input },
          ctx,
        );

      if (cached) {
        const built = buildWith(cached);
        const done = await insertPages(
          params,
          doc,
          entry,
          built,
          sceneIds,
          locale,
          signal,
          `clip ${params.clipId} page persisted (cached)`,
        );
        if (!done.ok) return done.failure;
        return result(
          `Inserted ${done.orders.length} clip page(s) after page ${params.afterOrder} (already rendered).`,
          {
            sceneIds,
            orders: done.orders,
            cached: true,
          },
        );
      }

      const config = getConfig();
      if (!config) {
        return fail(
          'clip-render-unavailable',
          'This clip is not rendered and on-demand rendering is not available on this deployment. Use a ready-made preset.',
          {
            validPresetIds: entry.presets.map((p) => p.id),
          },
        );
      }
      const client = deps.manimClient ?? createManimClient(config);
      const owner = deps.ownerId ?? deps.sessionId ?? 'anonymous';
      const submitted = await client.submit(
        {
          templateId: entry.id,
          templateRev: entry.engine.templateRev,
          params: input,
          locale: entry.bakedText ? locale : null,
        },
        owner,
      );
      switch (submitted.kind) {
        case 'accepted':
          break;
        case 'busy':
          return fail(
            'clip-render-busy',
            'The render service is busy. Try again later or use a ready-made preset.',
            { reason: submitted.reason },
          );
        case 'template-rev-mismatch':
          return fail(
            'template-rev-mismatch',
            'The render service has a different version of this clip template.',
            { current: submitted.current },
          );
        case 'invalid-params':
          return fail('invalid-params', 'The render service refused these parameters.');
        default:
          return fail(
            'clip-render-unavailable',
            'The render service could not be reached. Use a ready-made preset.',
            {
              validPresetIds: entry.presets.map((p) => p.id),
            },
          );
      }

      // one placeholder per chapter, registered like generate_video's, then the pages that carry them
      const refs: Record<string, string> = {};
      for (const chapter of entry.chapters) {
        refs[chapter.id] = `gen_vid_${nanoid(8)}`;
        registerPendingMedia({
          ref: refs[chapter.id],
          type: 'video',
          stageId: params.stageId,
          ...(deps.sessionId ? { sessionId: deps.sessionId } : {}),
        });
      }
      const built = buildWith({
        chapters: entry.chapters.map((c) => ({ id: c.id, url: refs[c.id], poster: '' })),
      });
      const done = await insertPages(
        params,
        doc,
        entry,
        built,
        sceneIds,
        locale,
        signal,
        `clip ${params.clipId} pages persisted (rendering)`,
      );
      if (!done.ok) return done.failure;

      const near = nearestPreset(entry, input);
      void runClipRenderJob({
        entry,
        stageId: params.stageId,
        ...(deps.sessionId ? { sessionId: deps.sessionId } : {}),
        toolCallId: callId,
        jobId: submitted.jobId,
        cacheKey: submitted.cacheKey,
        refs,
        client,
        owner,
        ...(near
          ? { fallbackHint: `The render failed; the nearest ready-made preset is "${near.id}".` }
          : {}),
        ...(deps.backgroundStore ? { backgroundStore: deps.backgroundStore } : {}),
        ...(deps.emitMediaReady ? { emitMediaReady: deps.emitMediaReady } : {}),
        ...(deps.put ? { put: deps.put } : {}),
        ...(deps.record ? { record: deps.record } : {}),
        ...(deps.patch ? { patch: deps.patch } : {}),
        ...(deps.pollMs !== undefined ? { pollMs: deps.pollMs } : {}),
        ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
      });
      return result(
        `Inserted ${done.orders.length} clip page(s) with placeholder videos; the clip is rendering in the background (a media_ready event reports each chapter). Do not wait and do not retry.`,
        { sceneIds, orders: done.orders, status: 'rendering', jobId: submitted.jobId, refs },
      );
    },
  };
  return tool;
}
