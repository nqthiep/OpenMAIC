import { describe, expect, it, vi } from 'vitest';

import { PlaybackEngine } from '@/lib/playback/engine';
import type { Action } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';
import type { ActionEngine } from '@/lib/action/engine';
import type { AudioPlayer } from '@/lib/utils/audio-player';

const predict = { id: 'a1', type: 'widget_setState', state: { predict: { beatId: 'b' } } };
const next = { id: 'a2', type: 'widget_reveal', target: '#x' };

const scene = {
  id: 'scene-1',
  stageId: 'stage-1',
  type: 'interactive',
  title: 'S',
  order: 1,
  content: { type: 'interactive' },
  actions: [predict, next] as unknown as Action[],
} as unknown as Scene;

const audio = {
  play: vi.fn(async () => false),
  onEnded: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  isPlaying: vi.fn(() => false),
  hasActiveAudio: vi.fn(() => false),
} as unknown as AudioPlayer;

const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function setup() {
  let answer!: () => void;
  const executed: string[] = [];
  const actionEngine = {
    execute: vi.fn((a: Action) => {
      executed.push(a.id);
      return a.id === 'a1' ? new Promise<void>((r) => (answer = r)) : Promise.resolve();
    }),
    clearEffects: vi.fn(),
    resetPlaybackVisualState: vi.fn(),
  } as unknown as ActionEngine;
  const engine = new PlaybackEngine([scene], actionEngine, audio);
  return { engine, executed, answer: () => answer() };
}

describe('PlaybackEngine pause/resume during a prediction wait', () => {
  it('does not continue the lecture on resume until the question is answered', async () => {
    const { engine, executed, answer } = setup();
    engine.start();
    await tick();
    expect(executed).toEqual(['a1']);

    engine.pause();
    engine.resume();
    await tick();
    expect(executed).toEqual(['a1']); // still waiting

    answer();
    await tick();
    expect(executed).toEqual(['a1', 'a2']);
  });

  it('answered while paused: resume continues straight away', async () => {
    const { engine, executed, answer } = setup();
    engine.start();
    await tick();
    engine.pause();
    answer();
    await tick();
    expect(executed).toEqual(['a1']);
    engine.resume();
    await tick();
    expect(executed).toEqual(['a1', 'a2']);
  });

  it('pause/resume twice does not run the next action twice', async () => {
    const { engine, executed, answer } = setup();
    engine.start();
    await tick();
    engine.pause();
    engine.resume();
    engine.pause();
    engine.resume();
    answer();
    await tick();
    expect(executed).toEqual(['a1', 'a2']);
  });
});
