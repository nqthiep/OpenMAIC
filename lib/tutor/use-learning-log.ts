'use client';

/**
 * Feeds the learner's walkthrough activity (steps reached, predictions) into `tutorLearning`, which the
 * teacher / parent page reads. Mounted once per classroom by the widget iframe host.
 *
 * The beats of a preset come from the page's own `widgetConfig`: `beatsByPreset` when the page has it,
 * else `beats` for the preset the page was built with.
 */
import { useEffect } from 'react';

import { useStageStore } from '@/lib/store/stage';
import { useWidgetRuntimeState } from '@/lib/store/widget-runtime-state';
import { appendTutorLearning, watchWidgetRuntime, type SceneBeats } from '@/lib/tutor/learning-log';
import type { BeatRef } from '@/lib/tutor/protocol/widget-data';

interface Config {
  walkthroughId?: unknown;
  entryRev?: unknown;
  presetId?: unknown;
  beats?: unknown;
  beatsByPreset?: Record<string, unknown>;
}

/** The `SceneBeats` of `preset` from a page's `widgetConfig`, or undefined when it does not say. */
export function beatsFromConfig(
  config: Config | undefined,
  preset: string,
): SceneBeats | undefined {
  if (!config || typeof config.walkthroughId !== 'string' || typeof config.entryRev !== 'number') {
    return undefined;
  }
  const own = config.presetId === preset ? config.beats : undefined;
  const beats = config.beatsByPreset?.[preset] ?? own;
  if (!Array.isArray(beats)) return undefined;
  return {
    walkthroughId: config.walkthroughId,
    entryRev: config.entryRev,
    beats: beats as BeatRef[],
  };
}

export function useTutorLearningLog(): void {
  const stageId = useStageStore((s) => s.stage?.id);
  useEffect(() => {
    if (!stageId) return;
    return watchWidgetRuntime(useWidgetRuntimeState, stageId, appendTutorLearning, {
      beatsOf(sceneId, preset) {
        const scene = useStageStore.getState().scenes.find((x) => x.id === sceneId);
        return beatsFromConfig(
          (scene?.content as { widgetConfig?: Config } | undefined)?.widgetConfig,
          preset,
        );
      },
    });
  }, [stageId]);
}
