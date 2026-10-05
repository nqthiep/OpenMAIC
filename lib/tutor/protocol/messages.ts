/**
 * Thông điệp host <-> iframe của widget walkthrough (INTERFACES §1, §2).
 * Nguyên tắc: kiểu lạ bị bỏ, giá trị ngoài miền bị kẹp hoặc bỏ trường, không ném lỗi.
 */
import type { Panel, PresetInfo } from './widget-data';

const PANELS: readonly Panel[] = ['pseudo', 'cpp', 'py'];
const MAX_TARGET_LEN = 200;
const MAX_INPUT_BYTES = 2048;
const SPEED_MIN = 0.25;
const SPEED_MAX = 2;

export interface WidgetStatePatch {
  preset?: string;
  frame?: number;
  panel?: Panel;
  speed?: number;
  playing?: boolean;
  restart?: boolean;
  predict?: { beatId: string };
}

export interface SetWidgetStateMessage {
  type: 'SET_WIDGET_STATE';
  state: WidgetStatePatch;
  content?: string;
}

export interface HighlightElementMessage {
  type: 'HIGHLIGHT_ELEMENT';
  target: string;
  content?: string;
}

export type InboundMessage = SetWidgetStateMessage | HighlightElementMessage;

export type Op =
  | { op: 'preset'; preset: string }
  | { op: 'frame'; frame: number }
  | { op: 'panel'; panel: Panel }
  | { op: 'speed'; speed: number }
  | { op: 'playing'; playing: boolean; restart: boolean }
  | { op: 'predict'; beatId: string }
  | { op: 'caption'; content: string };

export interface WidgetReady {
  __maicInteractive: true;
  kind: 'widget-ready';
  v: 1;
  walkthroughId: string;
  entryRev: number;
  presets: { id: string; total: number }[];
}

export interface WidgetState {
  __maicInteractive: true;
  kind: 'widget-state';
  v: 1;
  walkthroughId: string;
  preset: string;
  frame: number;
  input?: unknown;
  prediction?: { beatId: string; correct: boolean; skipped?: boolean };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

export function parseInbound(data: unknown): InboundMessage | null {
  try {
    if (!isRecord(data)) return null;
    if (data.type === 'SET_WIDGET_STATE') {
      const state: WidgetStatePatch = {};
      const raw = isRecord(data.state) ? data.state : {};
      if (typeof raw.preset === 'string') state.preset = raw.preset;
      if (isInt(raw.frame)) state.frame = raw.frame;
      if (typeof raw.panel === 'string' && (PANELS as readonly string[]).includes(raw.panel)) {
        state.panel = raw.panel as Panel;
      }
      if (typeof raw.speed === 'number' && Number.isFinite(raw.speed)) state.speed = raw.speed;
      if (typeof raw.playing === 'boolean') state.playing = raw.playing;
      if (typeof raw.restart === 'boolean') state.restart = raw.restart;
      if (isRecord(raw.predict) && typeof raw.predict.beatId === 'string') {
        state.predict = { beatId: raw.predict.beatId };
      }
      const msg: SetWidgetStateMessage = { type: 'SET_WIDGET_STATE', state };
      if (typeof data.content === 'string') msg.content = data.content;
      return msg;
    }
    if (data.type === 'HIGHLIGHT_ELEMENT') {
      if (typeof data.target !== 'string' || data.target.length > MAX_TARGET_LEN) return null;
      const msg: HighlightElementMessage = { type: 'HIGHLIGHT_ELEMENT', target: data.target };
      if (typeof data.content === 'string') msg.content = data.content;
      return msg;
    }
    return null;
  } catch {
    return null;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function planSetWidgetState(
  msg: SetWidgetStateMessage,
  presets: readonly { id: string; total: number }[],
  currentPreset: string,
): Op[] | null {
  const s = msg.state;
  if (s.preset !== undefined && !presets.some((p) => p.id === s.preset)) return null;

  const effective = s.preset ?? currentPreset;
  const total = presets.find((p) => p.id === effective)?.total;
  const changed = s.preset !== undefined && s.preset !== currentPreset;

  const ops: Op[] = [];
  if (s.preset !== undefined) ops.push({ op: 'preset', preset: s.preset });

  if (s.frame !== undefined) {
    const hi = total !== undefined ? Math.max(0, total - 1) : Infinity;
    ops.push({ op: 'frame', frame: clamp(s.frame, 0, hi) });
  } else if (changed) {
    ops.push({ op: 'frame', frame: 0 });
  }

  if (s.panel !== undefined) ops.push({ op: 'panel', panel: s.panel });
  if (s.speed !== undefined) ops.push({ op: 'speed', speed: clamp(s.speed, SPEED_MIN, SPEED_MAX) });
  if (s.playing !== undefined) {
    ops.push({ op: 'playing', playing: s.playing, restart: s.restart === true });
  }
  if (s.predict !== undefined) ops.push({ op: 'predict', beatId: s.predict.beatId });
  if (msg.content !== undefined) ops.push({ op: 'caption', content: msg.content });
  return ops;
}

export function makeReady(args: {
  walkthroughId: string;
  entryRev: number;
  presets: readonly Pick<PresetInfo, 'id' | 'total'>[];
}): WidgetReady {
  return {
    __maicInteractive: true,
    kind: 'widget-ready',
    v: 1,
    walkthroughId: args.walkthroughId,
    entryRev: args.entryRev,
    presets: args.presets.map((p) => ({ id: p.id, total: p.total })),
  };
}

export function makeState(args: {
  walkthroughId: string;
  preset: string;
  frame: number;
  input?: unknown;
  prediction?: { beatId: string; correct: boolean; skipped?: boolean };
}): WidgetState {
  const out: WidgetState = {
    __maicInteractive: true,
    kind: 'widget-state',
    v: 1,
    walkthroughId: args.walkthroughId,
    preset: args.preset,
    frame: args.frame,
  };
  if (args.input !== undefined) out.input = args.input;
  if (args.prediction !== undefined) out.prediction = args.prediction;
  return out;
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function parseWidgetEvent(data: unknown): WidgetReady | WidgetState | null {
  try {
    if (!isRecord(data) || data.__maicInteractive !== true || data.v !== 1) return null;
    if (typeof data.walkthroughId !== 'string') return null;
    if (data.kind === 'widget-ready') {
      if (!isInt(data.entryRev) || !Array.isArray(data.presets)) return null;
      const presets: { id: string; total: number }[] = [];
      for (const p of data.presets) {
        if (isRecord(p) && typeof p.id === 'string' && isInt(p.total) && p.total >= 0) {
          presets.push({ id: p.id, total: p.total });
        }
      }
      return makeReady({ walkthroughId: data.walkthroughId, entryRev: data.entryRev, presets });
    }
    if (data.kind === 'widget-state') {
      if (typeof data.preset !== 'string' || !isInt(data.frame) || data.frame < 0) return null;
      const out = makeState({
        walkthroughId: data.walkthroughId,
        preset: data.preset,
        frame: data.frame,
      });
      if (data.input !== undefined) {
        let json: string | undefined;
        try {
          json = JSON.stringify(data.input);
        } catch {
          json = undefined;
        }
        if (json !== undefined && utf8Bytes(json) <= MAX_INPUT_BYTES) out.input = data.input;
      }
      const pr = data.prediction;
      if (isRecord(pr) && typeof pr.beatId === 'string' && typeof pr.correct === 'boolean') {
        out.prediction = {
          beatId: pr.beatId,
          correct: pr.correct,
          ...(pr.skipped === true ? { skipped: true } : {}),
        };
      }
      return out;
    }
    return null;
  } catch {
    return null;
  }
}
