import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PPTVideoElement, Slide } from '@openmaic/dsl';

import { ActionEngine } from '@/lib/action/engine';
import { PlaybackEngine } from '@/lib/playback/engine';
import { useCanvasStore } from '@/lib/store/canvas';
import { useMediaGenerationStore, type MediaTask } from '@/lib/store/media-generation';
import { useWidgetRuntimeState } from '@/lib/store/widget-runtime-state';
import type { Action } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';
import type { AudioPlayer } from '@/lib/utils/audio-player';

const STAGE = 'stage-dispose';
const SCENE = 'scene-walkthrough';
const PRESET = 'p0';
const VIDEO_SCENE = 'scene-video';

const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

function stageStore(scenes: unknown[], currentSceneId: string | null) {
  return {
    getState: () => ({ stage: { id: STAGE }, scenes, currentSceneId }),
    setState: () => undefined,
    subscribe: () => () => undefined,
  };
}

function walkthroughScene(actions: Action[]): Scene {
  return {
    id: SCENE,
    stageId: STAGE,
    type: 'interactive',
    title: 'Walkthrough',
    order: 1,
    content: { type: 'interactive', widgetConfig: { kind: 'walkthrough' } },
    actions,
  } as unknown as Scene;
}

/** Audio with no pre-generated clip: the reading timer and onEnded are never reached here. */
function idleAudio(): AudioPlayer {
  return {
    play: vi.fn(async () => false),
    onEnded: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isPlaying: vi.fn(() => false),
    hasActiveAudio: vi.fn(() => false),
  } as unknown as AudioPlayer;
}

describe('dispose releases the action a playback is blocked on', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWidgetRuntimeState.setState({ byScene: {} });
    useWidgetRuntimeState.getState().markReady(SCENE, [{ id: PRESET, total: 5 }]);
  });
  afterEach(() => {
    vi.useRealTimers();
    useCanvasStore.getState().pauseVideo();
    useMediaGenerationStore.setState({ tasks: {} });
  });

  describe('walkthrough question', () => {
    it('PlaybackEngine.dispose releases the question and runs no later action', async () => {
      const question = {
        id: 'q',
        type: 'widget_setState',
        state: { preset: PRESET, frame: 2, predict: { beatId: 'mid' } },
      } as unknown as Action;
      const later = {
        id: 'later',
        type: 'widget_setState',
        state: { preset: PRESET, frame: 3 },
      } as unknown as Action;
      const scene = walkthroughScene([question, later]);
      const actionEngine = new ActionEngine(stageStore([scene], SCENE) as never, null, () => {});
      const execute = vi.spyOn(actionEngine, 'execute');
      const engine = new PlaybackEngine([scene], actionEngine, idleAudio());

      engine.start();
      await flush(300);
      expect(execute).toHaveBeenCalledTimes(1);
      let released = false;
      void (execute.mock.results[0].value as Promise<void>).then(() => (released = true));
      await flush();
      expect(released).toBe(false);

      engine.dispose();
      await flush();
      expect(released).toBe(true);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(engine.getMode()).toBe('idle');
    });
  });

  describe('video', () => {
    it('releases a video still waiting for its media, without starting it', async () => {
      const element = videoElement();
      useMediaGenerationStore.setState({
        tasks: { [element.id]: mediaTask(element.id, 'pending') },
      });
      const engine = new ActionEngine(actionStageStore(element) as never);
      let released = false;
      void engine
        .execute({ id: 'play', type: 'play_video', elementId: element.id })
        .then(() => (released = true));
      await flush();
      expect(released).toBe(false);

      engine.dispose();
      await flush();
      expect(released).toBe(true);
      expect(useCanvasStore.getState().playingVideoElementId).not.toBe(element.id);
    });

    it('pauses a video that is playing and releases its wait', async () => {
      const element = videoElement();
      useMediaGenerationStore.setState({
        tasks: { [element.id]: mediaTask(element.id, 'done', 'blob:video') },
      });
      const engine = new ActionEngine(actionStageStore(element) as never);
      let released = false;
      void engine
        .execute({ id: 'play', type: 'play_video', elementId: element.id })
        .then(() => (released = true));
      await flush();
      expect(useCanvasStore.getState().playingVideoElementId).toBe(element.id);
      expect(released).toBe(false);

      engine.dispose();
      await flush();
      expect(released).toBe(true);
      expect(useCanvasStore.getState().playingVideoElementId).not.toBe(element.id);
    });
  });

  describe('speech', () => {
    it('releases a speech line waiting for audio that will never end', async () => {
      const audio = {
        play: vi.fn(() => new Promise<boolean>(() => {})),
        onEnded: vi.fn(),
        stop: vi.fn(),
      } as unknown as AudioPlayer;
      const engine = new ActionEngine(stageStore([], null) as never, audio);
      let released = false;
      void engine
        .execute({ id: 'say', type: 'speech', text: 'Xin chào', audioId: 'a1' } as Action)
        .then(() => (released = true));
      await flush();
      expect(released).toBe(false);

      engine.dispose();
      await flush();
      expect(released).toBe(true);
    });
  });
});

function mediaTask(elementId: string, status: MediaTask['status'], objectUrl?: string): MediaTask {
  return {
    elementId,
    type: 'video',
    status,
    prompt: '',
    params: {},
    objectUrl,
    retryCount: 0,
    stageId: STAGE,
  };
}

function videoElement(): PPTVideoElement {
  return {
    id: 'video-1',
    type: 'video',
    src: 'ast_shared_video',
    mediaRef: 'ast_shared_video',
    left: 0,
    top: 0,
    width: 100,
    height: 56,
    rotate: 0,
    autoplay: false,
  };
}

/** A slide scene that holds the video element, so the action can resolve its media. */
function actionStageStore(element: PPTVideoElement) {
  const canvas = {
    id: 'slide-1',
    viewportSize: 1000,
    viewportRatio: 0.5625,
    background: { type: 'solid', color: '#fff' },
    elements: [element],
  } as Slide;
  const slide = {
    id: VIDEO_SCENE,
    type: 'slide',
    order: 0,
    title: 'Slide',
    content: { type: 'slide', canvas },
    actions: [],
  };
  return stageStore([slide], VIDEO_SCENE);
}
