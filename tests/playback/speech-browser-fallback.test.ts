import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlaybackEngine } from '@/lib/playback/engine';
import type { Action } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';
import type { ActionEngine } from '@/lib/action/engine';
import type { AudioPlayer } from '@/lib/utils/audio-player';

function speech(id: string, text: string): Action {
  return { id, type: 'speech', text } as Action;
}

function scene(actions: Action[]): Scene {
  return {
    id: 'scene-1',
    stageId: 'stage-1',
    type: 'slide',
    title: 'Scene 1',
    order: 1,
    content: { type: 'slide', canvas: {} },
    actions,
  } as unknown as Scene;
}

function createActionEngine() {
  return {
    execute: vi.fn(async () => {}),
    clearEffects: vi.fn(),
    resetPlaybackVisualState: vi.fn(),
  } as unknown as ActionEngine;
}

function createAudioPlayer(play: () => Promise<boolean>) {
  return {
    play: vi.fn(play),
    onEnded: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isPlaying: vi.fn(() => false),
    hasActiveAudio: vi.fn(() => false),
  } as unknown as AudioPlayer;
}

function stubSpeechSynthesis(voices = [{ voiceURI: 'v1', lang: 'en-US' }]) {
  const speak = vi.fn();
  class FakeUtterance {
    rate = 1;
    volume = 1;
    lang = '';
    voice = null;
    onend = null;
    onerror = null;
    constructor(public text: string) {}
  }
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('window', {
    speechSynthesis: {
      getVoices: () => voices,
      cancel: vi.fn(),
      speak,
    },
  });
  return speak;
}

// The workspace's tts slot decides whether speech is on (lib/audio/tts-selection.ts).
const ttsSlot = vi.hoisted(() => ({ on: true }));
vi.mock('@/lib/audio/tts-selection', () => ({
  ttsSelection: () =>
    ttsSlot.on ? { providerId: 'openai-tts', voice: 'alloy', speed: 1, providersConfig: {} } : null,
}));

/** A cloud provider is the tts slot's, or the slot is off. */
function selectCloudTTS(on: boolean) {
  ttsSlot.on = on;
}

describe('lecture speech falls back to browser speech', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('speaks the line when the cloud provider left no audio', async () => {
    const speak = stubSpeechSynthesis();
    selectCloudTTS(true);
    const engine = new PlaybackEngine(
      [scene([speech('a', 'Hello there.')])],
      createActionEngine(),
      createAudioPlayer(async () => false),
    );

    engine.start();

    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0].text).toBe('Hello there.');
  });

  it('speaks the line when playing the cloud audio throws', async () => {
    const speak = stubSpeechSynthesis();
    selectCloudTTS(true);
    const engine = new PlaybackEngine(
      [scene([speech('a', 'Hello there.')])],
      createActionEngine(),
      createAudioPlayer(async () => {
        throw new Error('decode failed');
      }),
    );

    engine.start();

    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0].text).toBe('Hello there.');
  });

  it('speaks Vietnamese text with a Vietnamese voice when the cloud provider left no audio', async () => {
    const speak = stubSpeechSynthesis([
      { voiceURI: 'samantha', lang: 'en-US' },
      { voiceURI: 'linh', lang: 'vi-VN' },
    ]);
    selectCloudTTS(true);
    const engine = new PlaybackEngine(
      [scene([speech('a', 'Xin chào các bạn.')])],
      createActionEngine(),
      createAudioPlayer(async () => false),
    );

    engine.start();

    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0]).toMatchObject({
      lang: 'vi-VN',
      voice: { voiceURI: 'linh' },
    });
  });

  it('keeps the generated audio and does not speak when it plays', async () => {
    const speak = stubSpeechSynthesis();
    selectCloudTTS(true);
    const engine = new PlaybackEngine(
      [scene([speech('a', 'Hello there.')])],
      createActionEngine(),
      createAudioPlayer(async () => true),
    );

    engine.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(speak).not.toHaveBeenCalled();
  });

  it('stays silent on the reading timer when TTS is turned off', async () => {
    vi.useFakeTimers();
    const speak = stubSpeechSynthesis();
    selectCloudTTS(false);
    const onSpeechEnd = vi.fn();
    const engine = new PlaybackEngine(
      [scene([speech('a', 'Hello there.')])],
      createActionEngine(),
      createAudioPlayer(async () => false),
      { onSpeechEnd },
    );

    engine.start();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(speak).not.toHaveBeenCalled();
    expect(onSpeechEnd).toHaveBeenCalledTimes(1);
  });
});
