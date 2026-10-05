'use client';

/**
 * Per-scene runtime state of walkthrough widget iframes (INTERFACES §1-§2, ADR 0013 §2,
 * DATA-MODEL §6). Not persisted. Keyed by sceneId:
 * - `desired`: last `SET_WIDGET_STATE` the engine asked for. Kept when the iframe is rebuilt,
 *   so it can be re-sent on the next `widget-ready`.
 * - `ready`/`totals`: set by `widget-ready`, cleared when the iframe is rebuilt.
 * - `state`: last `widget-state` (clamped), cleared when the iframe is rebuilt.
 *
 * The reducers are pure (`map in -> map out`) and exported for tests; the store wraps them.
 */
import { create } from 'zustand';
import type { SetWidgetStateMessage, WidgetState } from '@/lib/tutor/protocol/messages';

const MAX_INPUT_BYTES = 2048;
/** Preset id for the learner's own input: has no `total` in `widgetConfig`. */
const STUDENT_PRESET = 'student';

export interface WidgetRuntimeSnapshot {
  preset: string;
  frame: number;
  input?: unknown;
  prediction?: { beatId: string; correct: boolean };
}

export interface WidgetSceneRuntime {
  ready: boolean;
  /** `presets[].total` from the last `widget-ready`, by preset id. */
  totals?: Record<string, number>;
  desired?: SetWidgetStateMessage;
  state?: WidgetRuntimeSnapshot;
}

export type WidgetRuntimeMap = Readonly<Record<string, WidgetSceneRuntime>>;

function withScene(
  map: WidgetRuntimeMap,
  sceneId: string,
  next: WidgetSceneRuntime,
): WidgetRuntimeMap {
  return { ...map, [sceneId]: next };
}

function inputFits(input: unknown): boolean {
  try {
    const json = JSON.stringify(input);
    return json !== undefined && new TextEncoder().encode(json).length <= MAX_INPUT_BYTES;
  } catch {
    return false;
  }
}

export function setDesired(
  map: WidgetRuntimeMap,
  sceneId: string,
  msg: SetWidgetStateMessage,
): WidgetRuntimeMap {
  return withScene(map, sceneId, { ...(map[sceneId] ?? { ready: false }), desired: msg });
}

/** Marks the scene ready; `desired` is what the caller must send again (if any). */
export function markReady(
  map: WidgetRuntimeMap,
  sceneId: string,
  presets: readonly { id: string; total: number }[],
): { map: WidgetRuntimeMap; desired?: SetWidgetStateMessage } {
  const cur = map[sceneId];
  const totals: Record<string, number> = {};
  for (const p of presets) totals[p.id] = p.total;
  return {
    map: withScene(map, sceneId, { ...cur, ready: true, totals }),
    desired: cur?.desired,
  };
}

/**
 * Keeps the last `widget-state`. Ignored before `ready` and for a preset that is neither in the
 * `ready` presets nor `student`. `frame` is clamped to the preset's `[0, total-1]`; `input` is
 * kept only for the `student` preset and within 2048 bytes.
 */
export function recordState(
  map: WidgetRuntimeMap,
  sceneId: string,
  raw: WidgetState,
): WidgetRuntimeMap {
  const cur = map[sceneId];
  if (!cur?.ready || !Number.isInteger(raw.frame) || raw.frame < 0) return map;

  const student = raw.preset === STUDENT_PRESET;
  let frame = raw.frame;
  if (!student) {
    const total =
      cur.totals && Object.hasOwn(cur.totals, raw.preset) ? cur.totals[raw.preset] : undefined;
    if (total === undefined) return map;
    frame = Math.min(frame, Math.max(0, total - 1));
  }

  const state: WidgetRuntimeSnapshot = { preset: raw.preset, frame };
  if (student && raw.input !== undefined && inputFits(raw.input)) state.input = raw.input;
  if (raw.prediction) {
    state.prediction = { beatId: raw.prediction.beatId, correct: raw.prediction.correct };
  }
  return withScene(map, sceneId, { ...cur, state });
}

/** The iframe was rebuilt (or its `srcDoc` changed): forget `ready` and `state`, keep `desired`. */
export function resetIframe(map: WidgetRuntimeMap, sceneId: string): WidgetRuntimeMap {
  const cur = map[sceneId];
  if (!cur) return map;
  return withScene(
    map,
    sceneId,
    cur.desired ? { ready: false, desired: cur.desired } : { ready: false },
  );
}

interface WidgetRuntimeStore {
  byScene: WidgetRuntimeMap;
  setDesired: (sceneId: string, msg: SetWidgetStateMessage) => void;
  /** Returns the `desired` message to send again, if any. */
  markReady: (
    sceneId: string,
    presets: readonly { id: string; total: number }[],
  ) => SetWidgetStateMessage | undefined;
  recordState: (sceneId: string, raw: WidgetState) => void;
  resetIframe: (sceneId: string) => void;
}

export const useWidgetRuntimeState = create<WidgetRuntimeStore>((set, get) => ({
  byScene: {},
  setDesired: (sceneId, msg) => set((s) => ({ byScene: setDesired(s.byScene, sceneId, msg) })),
  markReady: (sceneId, presets) => {
    const r = markReady(get().byScene, sceneId, presets);
    set({ byScene: r.map });
    return r.desired;
  },
  recordState: (sceneId, raw) => set((s) => ({ byScene: recordState(s.byScene, sceneId, raw) })),
  resetIframe: (sceneId) => set((s) => ({ byScene: resetIframe(s.byScene, sceneId) })),
}));
