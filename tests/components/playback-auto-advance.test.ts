// @vitest-environment jsdom
/**
 * Auto-play after a scene completes. The advance applies only while the completed
 * scene is still the current one, so a lesson picked during the pause is not skipped.
 */
import { describe, expect, it } from 'vitest';

import { autoAdvanceTarget } from '@/components/edit/PlaybackChromeRoot';
import { PENDING_SCENE_ID } from '@/lib/store/stage';

const scenes = [
  { id: 'a', type: 'slide' },
  { id: 'b', type: 'slide' },
  { id: 'c', type: 'slide' },
];

describe('autoAdvanceTarget', () => {
  it('advances to the next scene while the completed scene is still current', () => {
    expect(
      autoAdvanceTarget({
        scenes,
        completedSceneId: 'a',
        currentSceneId: 'a',
        pendingOutlineCount: 0,
      }),
    ).toBe('b');
  });

  it('stays put when the user picked another lesson during the pause', () => {
    expect(
      autoAdvanceTarget({
        scenes,
        completedSceneId: 'a',
        currentSceneId: 'c',
        pendingOutlineCount: 0,
      }),
    ).toBeNull();
  });

  it('waits on the pending page after the last scene while outlines still generate', () => {
    expect(
      autoAdvanceTarget({
        scenes,
        completedSceneId: 'c',
        currentSceneId: 'c',
        pendingOutlineCount: 2,
      }),
    ).toBe(PENDING_SCENE_ID);
  });

  it('does not advance past the last scene when nothing is pending', () => {
    expect(
      autoAdvanceTarget({
        scenes,
        completedSceneId: 'c',
        currentSceneId: 'c',
        pendingOutlineCount: 0,
      }),
    ).toBeNull();
  });

  it('never auto-advances from a quiz, interactive or PBL scene', () => {
    for (const type of ['quiz', 'interactive', 'pbl']) {
      expect(
        autoAdvanceTarget({
          scenes: [
            { id: 'a', type },
            { id: 'b', type: 'slide' },
          ],
          completedSceneId: 'a',
          currentSceneId: 'a',
          pendingOutlineCount: 0,
        }),
      ).toBeNull();
    }
  });
});
