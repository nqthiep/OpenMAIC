/**
 * Player: nhịp phát frame cho walkthrough. Thuần TypeScript, không phụ thuộc DOM/React.
 * Ngữ nghĩa play/toggle xem INTERFACES §1 điều 4–5.
 */

export const BASE_FRAME_MS = 1200; // [Inference] chỉnh sau khi thử
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 2;

export interface PlayerState {
  readonly index: number;
  readonly total: number;
  readonly isPlaying: boolean;
  readonly speed: number;
}

export interface Player {
  getState(): PlayerState;
  subscribe(fn: (s: PlayerState) => void): () => void;
  play(opts?: { restart?: boolean }): void;
  pause(): void;
  toggle(): void;
  step(delta: 1 | -1): void;
  jump(index: number): void;
  setSpeed(speed: number): void;
  setTotal(total: number): void;
  reset(): void;
  dispose(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function normTotal(total: number): number {
  return Number.isFinite(total) ? Math.max(1, Math.floor(total)) : 1;
}

function normSpeed(speed: number): number {
  return clamp(speed, MIN_SPEED, MAX_SPEED);
}

export function createPlayer(opts: {
  total: number;
  speed?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  /** Đồng hồ (ms) để tính phần khoảng nhịp đã trôi qua; mặc định `Date.now`. */
  now?: () => number;
}): Player {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const now = opts.now ?? (() => Date.now());

  let state: PlayerState = {
    index: 0,
    total: normTotal(opts.total),
    isPlaying: false,
    speed: opts.speed === undefined || Number.isNaN(opts.speed) ? 1 : normSpeed(opts.speed),
  };
  let handle: unknown = null;
  let hasTimer = false;
  let tickStart = 0; // lúc khoảng nhịp hiện tại bắt đầu (đã quy đổi nếu đổi tốc độ giữa chừng)
  let tickPeriod = BASE_FRAME_MS; // độ dài đầy đủ của khoảng nhịp hiện tại
  let disposed = false;
  const subscribers = new Set<(s: PlayerState) => void>();

  function cancelTimer() {
    if (hasTimer) {
      clearTimer(handle);
      hasTimer = false;
      handle = null;
    }
  }

  /** `elapsed` = phần [0,1) của khoảng nhịp đã trôi qua; chỉ đổi tốc độ mới truyền khác 0. */
  function scheduleTick(elapsed = 0) {
    cancelTimer();
    tickPeriod = BASE_FRAME_MS / state.speed;
    tickStart = now() - elapsed * tickPeriod;
    hasTimer = true;
    handle = setTimer(tick, (1 - elapsed) * tickPeriod);
  }

  function commit(next: PlayerState) {
    const changed =
      next.index !== state.index ||
      next.total !== state.total ||
      next.isPlaying !== state.isPlaying ||
      next.speed !== state.speed;
    if (!changed) return;
    state = next;
    for (const fn of Array.from(subscribers)) fn(state);
  }

  function tick() {
    hasTimer = false;
    handle = null;
    if (disposed || !state.isPlaying) return;
    const index = state.index + 1;
    const atEnd = index >= state.total - 1;
    commit({ ...state, index: Math.min(index, state.total - 1), isPlaying: !atEnd });
    if (!atEnd && state.isPlaying) scheduleTick();
  }

  function startPlaying(fromIndex: number) {
    commit({ ...state, index: fromIndex, isPlaying: true });
    scheduleTick();
  }

  const isLast = () => state.index >= state.total - 1;

  return {
    getState: () => state,
    subscribe(fn) {
      if (disposed) return () => {};
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    play(o) {
      if (disposed || state.isPlaying) return;
      if (isLast()) {
        if (!o?.restart) return;
        if (state.total <= 1) return;
        startPlaying(0);
        return;
      }
      startPlaying(state.index);
    },
    pause() {
      if (disposed) return;
      cancelTimer();
      commit({ ...state, isPlaying: false });
    },
    toggle() {
      if (disposed) return;
      if (state.isPlaying) {
        this.pause();
      } else if (isLast()) {
        if (state.total > 1) startPlaying(0);
      } else {
        startPlaying(state.index);
      }
    },
    step(delta) {
      if (disposed) return;
      cancelTimer();
      commit({ ...state, isPlaying: false, index: clamp(state.index + delta, 0, state.total - 1) });
    },
    jump(index) {
      if (disposed || !Number.isInteger(index)) return;
      const next = clamp(index, 0, state.total - 1);
      const stillPlaying = state.isPlaying && next < state.total - 1;
      if (!stillPlaying) cancelTimer();
      commit({ ...state, index: next, isPlaying: stillPlaying });
      // Đang chạy: giữ nguyên bộ đếm (host gửi lại frame liên tục không được làm treo autoplay).
      if (stillPlaying && !hasTimer) scheduleTick();
    },
    setSpeed(speed) {
      if (disposed || Number.isNaN(speed)) return;
      const next = normSpeed(speed);
      if (next === state.speed) return; // cùng tốc độ: không đụng tới bộ đếm
      const elapsed = hasTimer ? clamp((now() - tickStart) / tickPeriod, 0, 1) : 0;
      commit({ ...state, speed: next });
      if (state.isPlaying) scheduleTick(elapsed);
    },
    setTotal(total) {
      if (disposed) return;
      cancelTimer();
      const t = normTotal(total);
      commit({ ...state, total: t, index: Math.min(state.index, t - 1), isPlaying: false });
    },
    reset() {
      if (disposed) return;
      cancelTimer();
      commit({ ...state, index: 0, isPlaying: false });
    },
    dispose() {
      disposed = true;
      cancelTimer();
      subscribers.clear();
    },
  };
}
