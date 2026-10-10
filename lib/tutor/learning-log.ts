/**
 * Ghi `tutorLearning` từ client (INTERFACES §8.3, DATA-MODEL §8, ADR 0014).
 *
 * - Builder thuần: dựng đúng hình dạng mà validator `tutorLearning`
 *   (`lib/runtime/payload-validators.ts`) chấp nhận; validator chỉ kiểm kiểu nên builder kẹp
 *   `hint.level` 1..3 và `rating.easy` 1..5.
 * - `appendTutorLearning`: một phiên tất định cho mỗi (stageId, learnerKey), append-only.
 * - `watchWidgetRuntime`: đổi `useWidgetRuntimeState` thành bản ghi `beat`/`prediction`.
 *
 * Client-only: ghi qua kho runtime của server persistence (upstream bỏ IndexedDB cho dữ liệu bền).
 */
import type { RuntimeSession } from '@openmaic/dsl';
import type { RuntimeStore } from '@openmaic/storage';

import { createLogger } from '@/lib/logger';
import { getLearnerKey } from '@/lib/runtime/learner-key';
import { getRuntimeStore } from '@/lib/runtime/store';
import type { WidgetRuntimeMap } from '@/lib/store/widget-runtime-state';
import type { BeatRef } from '@/lib/tutor/protocol/widget-data';
import { withRuntimeStorageSharedLock } from '@/lib/utils/chat-storage-lock';

const log = createLogger('TutorLearningLog');

export const TUTOR_LEARNING_KIND = 'tutorLearning';
export const MAX_HINT_LEVEL = 3;
export const MAX_RATING = 5;

export type TutorLearningPayload =
  | {
      type: 'beat';
      sceneId: string;
      walkthroughId: string;
      entryRev: number;
      preset: string;
      beatId: string;
      occurrence: number;
      at: string;
    }
  | { type: 'prediction'; sceneId: string; beatId: string; correct: boolean; skipped: boolean }
  | { type: 'hint'; sceneId: string; beatId: string; level: number }
  | { type: 'rating'; stageId: string; easy: number };

type Of<T extends TutorLearningPayload['type']> = Extract<TutorLearningPayload, { type: T }>;

/** Làm tròn rồi kẹp vào [min, max]; không phải số hữu hạn thì lấy `min`. */
function clampInt(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
}

export function buildBeatRecord(i: Omit<Of<'beat'>, 'type'>): Of<'beat'> {
  return {
    type: 'beat',
    sceneId: i.sceneId,
    walkthroughId: i.walkthroughId,
    entryRev: i.entryRev,
    preset: i.preset,
    beatId: i.beatId,
    occurrence: i.occurrence,
    at: i.at,
  };
}

export function buildPredictionRecord(
  i: Omit<Of<'prediction'>, 'type' | 'skipped'> & { skipped?: boolean },
): Of<'prediction'> {
  return {
    type: 'prediction',
    sceneId: i.sceneId,
    beatId: i.beatId,
    correct: i.correct,
    skipped: i.skipped ?? false,
  };
}

export function buildHintRecord(i: Omit<Of<'hint'>, 'type'>): Of<'hint'> {
  return {
    type: 'hint',
    sceneId: i.sceneId,
    beatId: i.beatId,
    level: clampInt(i.level, 1, MAX_HINT_LEVEL),
  };
}

export function buildRatingRecord(i: Omit<Of<'rating'>, 'type'>): Of<'rating'> {
  return { type: 'rating', stageId: i.stageId, easy: clampInt(i.easy, 1, MAX_RATING) };
}

/** Mức gợi ý = số lần bấm cho cặp (sceneId, beatId), kẹp 3. */
export class HintCounter {
  private readonly counts = new Map<string, number>();

  /** Lần yêu cầu thứ n (1..3) cho cặp này. */
  next(sceneId: string, beatId: string): number {
    const key = JSON.stringify([sceneId, beatId]);
    const n = Math.min(MAX_HINT_LEVEL, (this.counts.get(key) ?? 0) + 1);
    this.counts.set(key, n);
    return n;
  }
}

export interface LearningLogDeps {
  store?: RuntimeStore;
  learnerKey?: string;
  now?: () => string;
  mintId?: () => string;
}

export function tutorLearningSessionId(stageId: string, learnerKey: string): string {
  return `${TUTOR_LEARNING_KIND}:${encodeURIComponent(stageId)}:${encodeURIComponent(learnerKey)}`;
}

function samePartition(s: RuntimeSession, id: string, stageId: string, learnerKey: string) {
  return (
    s.id === id &&
    s.kind === TUTOR_LEARNING_KIND &&
    s.stageId === stageId &&
    s.learnerKey === learnerKey
  );
}

async function getOrCreateSession(
  store: RuntimeStore,
  id: string,
  stageId: string,
  learnerKey: string,
  now: string,
): Promise<RuntimeSession> {
  let session = await store.getSession(id);
  if (!session) {
    try {
      session = await store.createSession({
        id,
        kind: TUTOR_LEARNING_KIND,
        stageId,
        learnerKey,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      // Tab khác (hoặc lần gọi song song) có thể tạo trước sau lần đọc: đọc lại bản thắng.
      session = await store.getSession(id);
      if (!session) throw error;
    }
  }
  if (!samePartition(session, id, stageId, learnerKey)) {
    throw new Error(`tutorLearning session ${JSON.stringify(id)} is not in this partition`);
  }
  return session;
}

/**
 * Thêm một bản ghi vào phiên `tutorLearning` của (stageId, learnerKey). Không bao giờ reject:
 * lỗi ghi chỉ cảnh báo, vì việc học không được phụ thuộc vào việc ghi nhật ký.
 */
export async function appendTutorLearning(
  stageId: string,
  payload: TutorLearningPayload,
  sceneId?: string,
  deps: LearningLogDeps = {},
): Promise<void> {
  try {
    const now = (deps.now ?? (() => new Date().toISOString()))();
    const mintId = deps.mintId ?? (() => crypto.randomUUID());
    const store = deps.store ?? getRuntimeStore();
    const learnerKey = deps.learnerKey ?? (await getLearnerKey());
    const sessionId = tutorLearningSessionId(stageId, learnerKey);
    await withRuntimeStorageSharedLock(async () => {
      await getOrCreateSession(store, sessionId, stageId, learnerKey, now);
      await store.appendRecord({
        id: mintId(),
        sessionId,
        ...(sceneId !== undefined ? { sceneId } : {}),
        createdAt: now,
        payload,
      });
    });
  } catch (error) {
    log.warn('Failed to append tutorLearning record', error);
  }
}

/** Phần của `useWidgetRuntimeState` mà `watchWidgetRuntime` cần (zustand tương thích cấu trúc). */
export interface WidgetRuntimeSource {
  subscribe(
    listener: (state: { byScene: WidgetRuntimeMap }, prev: { byScene: WidgetRuntimeMap }) => void,
  ): () => void;
}

/** Beat của một (scene, preset): `useWidgetRuntimeState` không giữ dữ liệu này. */
export interface SceneBeats {
  walkthroughId: string;
  entryRev: number;
  beats: readonly BeatRef[];
}

export interface WatchWidgetRuntimeOptions {
  beatsOf: (sceneId: string, preset: string) => SceneBeats | undefined;
  now?: () => string;
}

type AppendFn = (
  stageId: string,
  payload: TutorLearningPayload,
  sceneId?: string,
) => Promise<void> | void;

/**
 * Theo dõi state widget: ghi `beat` khi `frame` chạm frame của một beat (mỗi beat+occurrence một
 * lần cho mỗi scene), ghi `prediction` khi `state.prediction` xuất hiện hoặc đổi. Ghi tuần tự để
 * giữ thứ tự `seq`. Trả về hàm huỷ đăng ký.
 */
export function watchWidgetRuntime(
  source: WidgetRuntimeSource,
  stageId: string,
  append: AppendFn,
  options: WatchWidgetRuntimeOptions,
): () => void {
  const now = options.now ?? (() => new Date().toISOString());
  const seenBeats = new Set<string>();
  const lastPrediction = new Map<string, string>();
  let tail: Promise<void> = Promise.resolve();

  const emit = (payload: TutorLearningPayload, sceneId: string): void => {
    tail = tail
      .then(() => append(stageId, payload, sceneId))
      .catch((error) => log.warn('Failed to append tutorLearning record', error));
  };

  return source.subscribe((next, prev) => {
    for (const [sceneId, scene] of Object.entries(next.byScene)) {
      const state = scene.state;
      if (!state || state === prev.byScene[sceneId]?.state) continue;

      const info = options.beatsOf(sceneId, state.preset);
      if (info) {
        for (const beat of info.beats) {
          if (beat.frame !== state.frame) continue;
          const key = JSON.stringify([sceneId, state.preset, beat.id, beat.occurrence]);
          if (seenBeats.has(key)) continue;
          seenBeats.add(key);
          emit(
            buildBeatRecord({
              sceneId,
              walkthroughId: info.walkthroughId,
              entryRev: info.entryRev,
              preset: state.preset,
              beatId: beat.id,
              occurrence: beat.occurrence,
              at: now(),
            }),
            sceneId,
          );
        }
      }

      const p = state.prediction;
      if (!p) {
        lastPrediction.delete(sceneId);
      } else {
        const skipped = p.skipped === true;
        const key = JSON.stringify([p.beatId, p.correct, skipped]);
        if (lastPrediction.get(sceneId) !== key) {
          lastPrediction.set(sceneId, key);
          emit(
            buildPredictionRecord({ sceneId, beatId: p.beatId, correct: p.correct, skipped }),
            sceneId,
          );
        }
      }
    }
  });
}
