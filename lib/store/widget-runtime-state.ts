'use client';

/**
 * Per-scene runtime state of walkthrough widget iframes (INTERFACES §1-§2, ADR 0013 §2,
 * DATA-MODEL §6). Not persisted. Keyed by sceneId:
 * - `desired`: sticky fields (`preset/frame/panel/speed/playing`) of the `SET_WIDGET_STATE`
 *   messages the engine sent, merged. One-shot fields (`predict`, `restart`, `content`) are never
 *   kept. Kept when the iframe is rebuilt, so it can be re-sent on the next `widget-ready`.
 * - `ready`/`totals`: set by `widget-ready`, cleared when the iframe is rebuilt.
 * - `state`: last `widget-state` (clamped), cleared when the iframe is rebuilt.
 *
 * The reducers are pure (`map in -> map out`) and exported for tests; the store wraps them.
 */
import { create } from 'zustand';
import {
  parseInbound,
  type SetWidgetStateMessage,
  type WidgetState,
  type WidgetStatePatch,
} from '@/lib/tutor/protocol/messages';

const MAX_INPUT_BYTES = 2048;
/** Preset id for the learner's own input: has no `total` in `widgetConfig`. */
const STUDENT_PRESET = 'student';

export interface WidgetRuntimeSnapshot {
  preset: string;
  frame: number;
  input?: unknown;
  prediction?: { beatId: string; correct: boolean; skipped?: boolean };
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

/**
 * Merges the sticky fields of `msg` into `desired`. A different `preset` without a `frame` drops
 * the old frame (it belonged to the old preset). `predict`/`restart`/`content` are one-shot and
 * must not be replayed when the iframe is rebuilt, so they are not stored.
 */
export function setDesired(
  map: WidgetRuntimeMap,
  sceneId: string,
  msg: SetWidgetStateMessage,
): WidgetRuntimeMap {
  const cur = map[sceneId] ?? { ready: false };
  const prev = cur.desired?.state ?? {};
  const { preset, frame, panel, speed, playing } = msg.state;
  const state: WidgetStatePatch = { ...prev };
  if (preset !== undefined) {
    if (preset !== prev.preset) delete state.frame;
    state.preset = preset;
  }
  if (frame !== undefined) state.frame = frame;
  if (panel !== undefined) state.panel = panel;
  if (speed !== undefined) state.speed = speed;
  if (playing !== undefined) state.playing = playing;
  if ([preset, frame, panel, speed, playing].every((v) => v === undefined)) return map;
  return withScene(map, sceneId, { ...cur, desired: { type: 'SET_WIDGET_STATE', state } });
}

/**
 * Marks the scene ready; `desired` is what the caller must send again (if any). When the scene's
 * own `widgetConfig.presets` are given, only the ready presets that are in it are kept, with the
 * config's `total` (the iframe-reported one is not trusted).
 */
export function markReady(
  map: WidgetRuntimeMap,
  sceneId: string,
  presets: readonly { id: string; total: number }[],
  configPresets?: readonly { id: string; total: number }[],
): { map: WidgetRuntimeMap; desired?: SetWidgetStateMessage } {
  const cur = map[sceneId];
  const totals: Record<string, number> = {};
  for (const p of presets) {
    if (!configPresets) totals[p.id] = p.total;
    else {
      const own = configPresets.find((c) => c.id === p.id);
      if (own) totals[p.id] = own.total;
    }
  }
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
    state.prediction = {
      beatId: raw.prediction.beatId,
      correct: raw.prediction.correct,
      ...(raw.prediction.skipped === true ? { skipped: true } : {}),
    };
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
    configPresets?: readonly { id: string; total: number }[],
  ) => SetWidgetStateMessage | undefined;
  recordState: (sceneId: string, raw: WidgetState) => void;
  resetIframe: (sceneId: string) => void;
}

export const useWidgetRuntimeState = create<WidgetRuntimeStore>((set, get) => ({
  byScene: {},
  setDesired: (sceneId, msg) => set((s) => ({ byScene: setDesired(s.byScene, sceneId, msg) })),
  markReady: (sceneId, presets, configPresets) => {
    const r = markReady(get().byScene, sceneId, presets, configPresets);
    set({ byScene: r.map });
    return r.desired;
  },
  recordState: (sceneId, raw) => set((s) => ({ byScene: recordState(s.byScene, sceneId, raw) })),
  resetIframe: (sceneId) => set((s) => ({ byScene: resetIframe(s.byScene, sceneId) })),
}));

/**
 * Records the `desired` of a `SET_WIDGET_STATE` payload even when no iframe is registered yet
 * (the pooled iframe registers its `send` a commit after the playback engine is built).
 */
export function recordDesiredPayload(
  sceneId: string,
  type: string,
  payload: Record<string, unknown>,
): void {
  if (type !== 'SET_WIDGET_STATE') return;
  const msg = parseInbound({ type, ...payload });
  if (msg?.type === 'SET_WIDGET_STATE') useWidgetRuntimeState.getState().setDesired(sceneId, msg);
}
