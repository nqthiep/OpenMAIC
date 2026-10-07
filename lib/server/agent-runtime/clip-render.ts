/**
 * The detached on-demand render of a clip (task 3C-08): poll the manim-service until the job ends, download the files of
 * every chapter, store them by content hash, remember them under the cache key and swap each page's placeholder for its
 * real video. It never throws: every outcome is a settled pending-media task and a `media_ready` frame (done, or failed
 * with a hint such as the nearest ready-made preset).
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { clipAssetUrl, putClipAsset, type PutResult } from '@/lib/clips/asset-store';
import type { ManimClient } from '@/lib/clips/service-client';
import { recordRuntimeAsset } from '@/lib/clips/runtime-index';
import type { ClipAsset, AnyClipEntry } from '@/lib/clips/types';
import { createLogger } from '@/lib/logger';
import type { MediaReadyLifecycleData } from '@/lib/agent-runtime/lifecycle';
import { defaultEmitMediaReady, patchStageVideoPlaceholder } from './generate-video';
import type { CourseStore } from './course-tools';
import { MEDIA_TOOL_ERROR_REASONS } from './media-tool-result';
import { setPendingMediaStage, settlePendingMedia } from './pending-media';

const log = createLogger('AgentClipRender');

export const CLIP_RENDER_POLL_MS = 3_000;
/** The whole job may take this long from the first poll (a render is minutes, OPERATIONS §8). */
export const CLIP_RENDER_TIMEOUT_MS = 15 * 60_000;
/** The completion patch is a few document writes. */
export const CLIP_PATCH_TIMEOUT_MS = 60_000;

export interface ClipRenderJob {
  entry: AnyClipEntry;
  stageId: string;
  sessionId?: string;
  toolCallId: string;
  jobId: string;
  cacheKey: string;
  /** chapter id → the placeholder ref its page currently carries */
  refs: Readonly<Record<string, string>>;
  client: ManimClient;
  /** the owner id of the session, sent as `x-openmaic-client` */
  owner: string;
  /** hint for the agent when the render fails: the nearest ready-made preset, if any */
  fallbackHint?: string;
  backgroundStore?: CourseStore;
  emitMediaReady?: (sessionId: string, data: MediaReadyLifecycleData) => void | Promise<void>;
  put?: typeof putClipAsset;
  record?: typeof recordRuntimeAsset;
  patch?: typeof patchStageVideoPlaceholder;
  pollMs?: number;
  timeoutMs?: number;
}

export type ClipRenderOutcome =
  | { status: 'done'; asset: ClipAsset }
  | { status: 'failed'; errorCode: string };

async function emit(job: ClipRenderJob, data: MediaReadyLifecycleData): Promise<void> {
  if (!job.sessionId) {
    log.warn(`[${job.toolCallId}] media_ready skipped: no session id`);
    return;
  }
  try {
    await (job.emitMediaReady ?? defaultEmitMediaReady)(job.sessionId, data);
  } catch (error) {
    log.error(`[${job.toolCallId}] media_ready emit failed for ${data.ref}`, error);
  }
}

async function finishFailed(job: ClipRenderJob, errorCode: string): Promise<ClipRenderOutcome> {
  for (const ref of Object.values(job.refs)) {
    settlePendingMedia(ref, { status: 'failed', errorCode });
    await emit(job, {
      ref,
      stageId: job.stageId,
      status: 'failed',
      errorCode,
      ...(job.fallbackHint ? { hint: job.fallbackHint } : {}),
    });
  }
  return { status: 'failed', errorCode };
}

export async function runClipRenderJob(job: ClipRenderJob): Promise<ClipRenderOutcome> {
  const pollMs = job.pollMs ?? CLIP_RENDER_POLL_MS;
  const deadline = Date.now() + (job.timeoutMs ?? CLIP_RENDER_TIMEOUT_MS);
  const put = job.put ?? putClipAsset;
  const record = job.record ?? recordRuntimeAsset;
  const patch = job.patch ?? patchStageVideoPlaceholder;
  try {
    for (const ref of Object.values(job.refs)) setPendingMediaStage(ref, 'submit');

    // 1. wait for the job to end
    for (;;) {
      const s = await job.client.status(job.jobId, job.owner);
      if (s.kind === 'status') {
        if (s.status === 'succeeded') break;
        if (s.status === 'failed' || s.status === 'cancelled') {
          log.warn(`[${job.toolCallId}] clip render ${job.jobId} ${s.status}: ${s.error ?? ''}`);
          return await finishFailed(job, MEDIA_TOOL_ERROR_REASONS.generationFailed);
        }
      } else if (s.kind === 'not-found' || s.kind === 'unauthorized') {
        return await finishFailed(job, MEDIA_TOOL_ERROR_REASONS.generationFailed);
      } // an `error` result is a hiccup of the network: keep polling until the deadline
      if (Date.now() >= deadline) {
        await job.client.cancel(job.jobId, job.owner);
        return await finishFailed(job, MEDIA_TOOL_ERROR_REASONS.timeout);
      }
      await sleep(pollMs);
    }

    // 2. download and store every file
    for (const ref of Object.values(job.refs)) setPendingMediaStage(ref, 'persist');
    const stored: { id: string; video: PutResult; poster: PutResult }[] = [];
    for (const chapter of job.entry.chapters) {
      const video = await job.client.download(job.jobId, chapter.id, job.owner);
      const poster = await job.client.download(job.jobId, `${chapter.id}.png`, job.owner);
      if (video.kind !== 'file' || poster.kind !== 'file') {
        log.warn(`[${job.toolCallId}] clip render ${job.jobId}: download of ${chapter.id} failed`);
        return await finishFailed(job, MEDIA_TOOL_ERROR_REASONS.generationFailed);
      }
      stored.push({
        id: chapter.id,
        video: await put(video.bytes, 'mp4'),
        poster: await put(poster.bytes, 'png'),
      });
    }
    const manifest = await job.client.download(job.jobId, 'manifest', job.owner);
    const manifestFile = manifest.kind === 'file' ? await put(manifest.bytes, 'json') : null;

    // 3. remember it, so the next request with the same parameters answers at once
    const asset: ClipAsset = {
      chapters: stored.map((c) => ({
        id: c.id,
        url: clipAssetUrl(c.video.name),
        poster: clipAssetUrl(c.poster.name),
      })),
      ...(manifestFile ? { manifest: manifestFile.url } : {}),
    };
    await record(job.cacheKey, asset);

    // 4. swap each placeholder for the stored video; a patch that fails must not undo a stored asset
    for (const c of asset.chapters) {
      const ref = job.refs[c.id];
      if (job.backgroundStore) {
        setPendingMediaStage(ref, 'patch');
        try {
          await patch(
            job.backgroundStore,
            job.stageId,
            ref,
            c.url,
            AbortSignal.timeout(CLIP_PATCH_TIMEOUT_MS),
          );
        } catch (error) {
          log.error(`[${job.toolCallId}] patch failed for ${ref}`, error);
        }
      }
      settlePendingMedia(ref, { status: 'done', src: c.url, mime: 'video/mp4' });
      await emit(job, { ref, stageId: job.stageId, status: 'done', src: c.url, mime: 'video/mp4' });
    }
    return { status: 'done', asset };
  } catch (error) {
    log.error(`[${job.toolCallId}] clip render job crashed for ${job.jobId}`, error);
    return await finishFailed(job, MEDIA_TOOL_ERROR_REASONS.generationFailed);
  }
}
