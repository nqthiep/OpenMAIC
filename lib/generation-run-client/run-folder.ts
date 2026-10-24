/**
 * KHAITAM patch point: the folder (the learner's subject) a course is filed into once its run has
 * produced it. The run does not know folders; the composer remembers the choice for the run it
 * started and the generation preview files the course when the run's course exists.
 */
function key(runId: string): string {
  return `generationRunFolder:${runId}`;
}

/** Remember the folder chosen for a run, for this tab (a reload of the preview keeps it). */
export function rememberRunFolder(runId: string, folderId: string | undefined): void {
  if (!folderId) return;
  try {
    sessionStorage.setItem(key(runId), folderId);
  } catch {
    /* sessionStorage unavailable: the course is left unfiled */
  }
}

/** The folder remembered for a run, forgotten as it is read; undefined when there is none. */
export function takeRunFolder(runId: string): string | undefined {
  try {
    const folderId = sessionStorage.getItem(key(runId)) ?? undefined;
    if (folderId) sessionStorage.removeItem(key(runId));
    return folderId;
  } catch {
    return undefined;
  }
}
