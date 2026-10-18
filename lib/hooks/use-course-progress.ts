'use client';

import { useEffect } from 'react';
import { fetchProgress, putProgress } from '@/components/learning/learning-api';
import { useAccountSession } from '@/lib/capabilities/use-capabilities';
import { loadCurrentScene } from '@/lib/document-store';
import { createProgressReporter, type ProgressReporter } from '@/lib/learning/progress-reporter';
import { useStageStore } from '@/lib/store';

// The reporter of the course on screen, so a quiz deep in the tree can add its score.
let active: ProgressReporter | null = null;

/** Tells the server a quiz of `courseId` was graded. Does nothing when that course is not being reported. */
export function reportQuizScore(courseId: string, score: number): void {
  active?.quiz(courseId, score);
}

/**
 * For a signed-in learner reading a course they do not own (a class, shared or preview course):
 * opens it at the scene they reached on another device when this device has no position of its
 * own, then reports each scene they move to. The owner's own courses are left alone: the home
 * reads those from this device. Fails quietly; the course works without progress.
 */
export function useCourseProgress(courseId: string, ready: boolean): void {
  const signedIn = useAccountSession()?.authenticated === true;

  useEffect(() => {
    if (!ready || !signedIn) return;
    let live = true;
    let reporter: ProgressReporter | null = null;
    let unsubscribe = () => {};

    void (async () => {
      const [saved, rows] = await Promise.all([
        loadCurrentScene(courseId).catch(() => null),
        fetchProgress([courseId]).catch(() => []),
      ]);
      if (!live) return;
      const resumeAt = rows[0]?.sceneId;
      const resumable =
        !saved && resumeAt && useStageStore.getState().scenes.some((s) => s.id === resumeAt);
      if (resumable) useStageStore.getState().setCurrentSceneId(resumeAt);

      const next = createProgressReporter(putProgress);
      reporter = next;
      active = next;
      const read = () => {
        const { stage, scenes, currentSceneId, isOwner } = useStageStore.getState();
        if (stage?.id !== courseId || isOwner !== false || !currentSceneId) return;
        const index = scenes.findIndex((scene) => scene.id === currentSceneId);
        if (index < 0) return;
        next.moveTo({
          courseId,
          sceneId: currentSceneId,
          sceneIndex: index + 1,
          sceneCount: scenes.length,
        });
      };
      read();
      unsubscribe = useStageStore.subscribe(read);
    })();

    return () => {
      live = false;
      unsubscribe();
      reporter?.flush();
      if (active === reporter) active = null;
    };
  }, [courseId, ready, signedIn]);
}
