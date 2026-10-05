import { describe, expect, it } from 'vitest';
import { currentWidgetState } from '@/lib/chat/agent-loop';
import type { WidgetRuntimeMap } from '@/lib/store/widget-runtime-state';

const walkthrough = (id: string, walkthroughId = 'binary-search') => ({
  id,
  content: { type: 'interactive', widgetConfig: { kind: 'walkthrough', walkthroughId } },
});

const readyAt = (frame: number, extra: object = {}): WidgetRuntimeMap => ({
  s1: { ready: true, state: { preset: 'p1', frame, ...extra } },
});

describe('currentWidgetState', () => {
  it('returns ids and numbers of the current ready walkthrough scene', () => {
    expect(currentWidgetState('s1', readyAt(4), [walkthrough('s1')])).toEqual({
      sceneId: 's1',
      walkthroughId: 'binary-search',
      preset: 'p1',
      frame: 4,
    });
  });

  it('keeps input (student preset) and drops prediction', () => {
    const runtime: WidgetRuntimeMap = {
      s1: {
        ready: true,
        state: {
          preset: 'student',
          frame: 2,
          input: [1, 2, 3],
          prediction: { beatId: 'b', correct: true },
        },
      },
    };
    const out = currentWidgetState('s1', runtime, [walkthrough('s1')]);
    expect(out).toEqual({
      sceneId: 's1',
      walkthroughId: 'binary-search',
      preset: 'student',
      frame: 2,
      input: [1, 2, 3],
    });
  });

  it('is undefined when the scene is not ready or has no reported state', () => {
    const scenes = [walkthrough('s1')];
    expect(currentWidgetState('s1', { s1: { ready: false } }, scenes)).toBeUndefined();
    expect(currentWidgetState('s1', { s1: { ready: true } }, scenes)).toBeUndefined();
    expect(
      currentWidgetState('s1', { s1: { ready: false, state: { preset: 'p1', frame: 1 } } }, scenes),
    ).toBeUndefined();
  });

  it('only looks at the current scene', () => {
    const runtime: WidgetRuntimeMap = {
      ...readyAt(3),
      s2: { ready: true, state: { preset: 'p1', frame: 9 } },
    };
    const scenes = [walkthrough('s1'), walkthrough('s2', 'quick-sort')];
    expect(currentWidgetState('s2', runtime, scenes)).toMatchObject({
      sceneId: 's2',
      walkthroughId: 'quick-sort',
      frame: 9,
    });
    expect(currentWidgetState('s3', runtime, scenes)).toBeUndefined();
    expect(currentWidgetState(null, runtime, scenes)).toBeUndefined();
    expect(currentWidgetState(undefined, runtime, scenes)).toBeUndefined();
  });

  it('is undefined for a scene that is not a walkthrough', () => {
    const slide = { id: 's1', content: { type: 'slide' } };
    const html = { id: 's1', content: { type: 'interactive', widgetConfig: { kind: 'other' } } };
    const noCfg = { id: 's1', content: { type: 'interactive' } };
    const badId = {
      id: 's1',
      content: { type: 'interactive', widgetConfig: { kind: 'walkthrough', walkthroughId: 7 } },
    };
    for (const scene of [slide, html, noCfg, badId]) {
      expect(currentWidgetState('s1', readyAt(1), [scene])).toBeUndefined();
    }
    expect(currentWidgetState('s1', readyAt(1), [])).toBeUndefined();
  });

  it('does not read inherited keys of the runtime map', () => {
    expect(currentWidgetState('toString', {}, [walkthrough('toString')])).toBeUndefined();
  });
});
