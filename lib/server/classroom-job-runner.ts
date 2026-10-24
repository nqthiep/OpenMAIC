import { createLogger } from '@/lib/logger';
import { enterSpendOwner } from '@/lib/server/authz/spend-context';
import { generateClassroom, type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import {
  markClassroomGenerationJobFailed,
  markClassroomGenerationJobRunning,
  markClassroomGenerationJobSucceeded,
  updateClassroomGenerationJobProgress,
} from '@/lib/server/classroom-job-store';
import { MODEL_FAILURE_TEXT, describeUnexpectedError } from '@/lib/server/error-summary';

const log = createLogger('ClassroomJob');
const runningJobs = new Map<string, Promise<void>>();

export function runClassroomGenerationJob(
  jobId: string,
  input: GenerateClassroomInput,
  baseUrl: string,
  { ownerId }: { ownerId: string },
): Promise<void> {
  const existing = runningJobs.get(jobId);
  if (existing) {
    return existing;
  }

  const jobPromise = (async () => {
    // Runs after the response, so the request's spend owner does not reach it: set it again here.
    if (ownerId) enterSpendOwner(ownerId);
    let managedKey = false;
    try {
      await markClassroomGenerationJobRunning(jobId);

      const result = await generateClassroom(input, {
        baseUrl,
        ownerId,
        onProgress: async (progress) => {
          await updateClassroomGenerationJobProgress(jobId, progress);
        },
        onManagedKey: (resolvedManagedKey) => {
          if (resolvedManagedKey) managedKey = true;
        },
      });

      await markClassroomGenerationJobSucceeded(jobId, result);
    } catch (error) {
      const message = managedKey
        ? MODEL_FAILURE_TEXT
        : error instanceof Error
          ? error.message
          : String(error);
      log.error(`Classroom generation job ${jobId} failed: ${describeUnexpectedError(error)}`);
      try {
        await markClassroomGenerationJobFailed(jobId, message);
      } catch (markFailedError) {
        log.error(`Failed to persist failed status for job ${jobId}:`, markFailedError);
      }
    } finally {
      runningJobs.delete(jobId);
    }
  })();

  runningJobs.set(jobId, jobPromise);
  return jobPromise;
}
