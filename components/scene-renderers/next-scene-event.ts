/**
 * A scene (the quiz report) asks the player to go on. The player listens and applies its own
 * switch guard, so the scene needs no handle to it.
 */
export const NEXT_SCENE_EVENT = 'openmaic:next-scene';

export function requestNextScene(): void {
  window.dispatchEvent(new Event(NEXT_SCENE_EVENT));
}
