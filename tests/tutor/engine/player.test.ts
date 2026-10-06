import { afterEach, describe, it, expect, vi } from 'vitest';
import { BASE_FRAME_MS, createPlayer } from '@/lib/tutor/engine/player';

function fake() {
  let next = 1;
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let t = 0;
  return {
    timers,
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    setTimer: (fn: () => void, ms: number) => {
      const id = next++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (h: unknown) => {
      timers.delete(h as number);
    },
    fire() {
      const [id, t] = [...timers.entries()][0];
      timers.delete(id);
      t.fn();
    },
  };
}
const make = (total: number, speed?: number) => {
  const f = fake();
  return {
    f,
    p: createPlayer({
      total,
      speed,
      setTimer: f.setTimer,
      clearTimer: f.clearTimer,
      now: f.now,
    }),
  };
};

describe('createPlayer', () => {
  it('plays, advances and auto-stops at last frame', () => {
    const { f, p } = make(3);
    p.play();
    expect(p.getState().isPlaying).toBe(true);
    expect([...f.timers.values()][0].ms).toBe(BASE_FRAME_MS);
    f.fire();
    expect(p.getState().index).toBe(1);
    f.fire();
    expect(p.getState()).toMatchObject({ index: 2, isPlaying: false });
    expect(f.timers.size).toBe(0);
  });

  it('pause, step, jump clamp', () => {
    const { f, p } = make(3);
    p.play();
    p.pause();
    expect(f.timers.size).toBe(0);
    p.step(-1);
    expect(p.getState().index).toBe(0);
    p.step(1);
    p.step(1);
    p.step(1);
    expect(p.getState().index).toBe(2);
    p.jump(-5);
    expect(p.getState().index).toBe(0);
    p.jump(99);
    expect(p.getState().index).toBe(2);
    p.jump(1.5);
    p.jump(NaN);
    expect(p.getState().index).toBe(2);
  });

  it('step pauses while playing', () => {
    const { p } = make(5);
    p.play();
    p.step(1);
    expect(p.getState()).toMatchObject({ index: 1, isPlaying: false });
  });

  it('speed clamps, ignores NaN, changes delay', () => {
    const { f, p } = make(3, 10);
    expect(p.getState().speed).toBe(2);
    p.setSpeed(0.01);
    expect(p.getState().speed).toBe(0.25);
    p.setSpeed(NaN);
    expect(p.getState().speed).toBe(0.25);
    p.setSpeed(2);
    p.play();
    expect([...f.timers.values()][0].ms).toBe(BASE_FRAME_MS / 2);
    p.setSpeed(1);
    expect(f.timers.size).toBe(1);
    expect([...f.timers.values()][0].ms).toBe(BASE_FRAME_MS);
  });

  it('toggle at end restarts; play() at end is idle; play({restart}) goes to 0', () => {
    const { p } = make(2);
    p.jump(1);
    p.play();
    expect(p.getState()).toMatchObject({ index: 1, isPlaying: false });
    p.toggle();
    expect(p.getState()).toMatchObject({ index: 0, isPlaying: true });
    p.toggle();
    expect(p.getState().isPlaying).toBe(false);
    p.jump(1);
    p.play({ restart: true });
    expect(p.getState()).toMatchObject({ index: 0, isPlaying: true });
    p.play();
    expect(p.getState().index).toBe(0);
  });

  it('setTotal stops, clamps index, total<1 is 1; reset', () => {
    const { f, p } = make(5);
    p.jump(4);
    p.jump(2);
    p.play();
    p.setTotal(2);
    expect(p.getState()).toMatchObject({ total: 2, index: 1, isPlaying: false });
    expect(f.timers.size).toBe(0);
    p.setTotal(0);
    expect(p.getState()).toMatchObject({ total: 1, index: 0 });
    p.setTotal(4);
    p.jump(3);
    p.reset();
    expect(p.getState()).toMatchObject({ index: 0, isPlaying: false });
  });

  it('dispose cancels timer and subscribers', () => {
    const { f, p } = make(3);
    let calls = 0;
    p.subscribe(() => calls++);
    p.play();
    expect(calls).toBe(1);
    p.dispose();
    expect(f.timers.size).toBe(0);
    p.step(1);
    expect(calls).toBe(1);
  });

  it('subscribe notifies only on real change and can unsubscribe', () => {
    const { p } = make(3);
    let calls = 0;
    const off = p.subscribe(() => calls++);
    p.pause();
    p.reset();
    p.jump(0);
    expect(calls).toBe(0);
    p.jump(1);
    expect(calls).toBe(1);
    off();
    p.jump(2);
    expect(calls).toBe(1);
  });

  it('setSpeed to the same speed does not touch the timer', () => {
    const { f, p } = make(5);
    p.play();
    const [id] = [...f.timers.keys()];
    f.advance(800);
    p.setSpeed(1);
    expect([...f.timers.keys()]).toEqual([id]);
  });

  it('a real speed change keeps the elapsed fraction of the current interval', () => {
    const { f, p } = make(5);
    p.play();
    f.advance(600); // half of 1200
    p.setSpeed(2); // period 600, half left
    expect([...f.timers.values()].map((t) => t.ms)).toEqual([300]);
    f.advance(150); // 300 of 600 + 150 -> 0.75 of the interval elapsed
    p.setSpeed(1); // period 1200, a quarter left
    expect([...f.timers.values()].map((t) => t.ms)).toEqual([300]);
  });

  it('jump while playing keeps the running timer', () => {
    const { f, p } = make(5);
    p.play();
    const [id] = [...f.timers.keys()];
    f.advance(800);
    p.jump(2);
    p.jump(2);
    expect(p.getState()).toMatchObject({ index: 2, isPlaying: true });
    expect([...f.timers.keys()]).toEqual([id]);
  });
});

describe('createPlayer with real timers', () => {
  afterEach(() => vi.useRealTimers());

  it('re-sending speed and frame every 800 ms at the 1200 ms period does not freeze autoplay', () => {
    vi.useFakeTimers();
    const p = createPlayer({ total: 20 });
    p.play();
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(800);
      p.setSpeed(1);
      p.jump(p.getState().index);
    }
    // 4800 ms at 1200 ms per frame
    expect(p.getState().index).toBe(4);
    p.dispose();
  });
});
