import { requireSpender } from '@/lib/server/authz/viewer';
/**
 * POST /api/pbl/v2/open-task
 *
 * Drives the Instructor's GREETING (first time in the project) or
 * SETUP (a new microtask just became active) phase. Without this,
 * the workspace would silently wait for the learner to type first —
 * which contradicts the "Instructor speaks first when a new task
 * activates" UX rule.
 *
 * Returns the same SSE stream shape as `/instructor`; the client
 * just dispatches it differently (no learner message to record,
 * Instructor's reply is the only message that lands).
 */
import { modelAuthorizationResponse } from '@/lib/server/api-response';

import type { NextRequest } from 'next/server';

import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';

import { createSSEResponse } from '@/lib/pbl/v2/api/sse';
import { applyRequestLocaleToProject } from '@/lib/pbl/v2/api/locale';
import { runInstructorTurn } from '@/lib/pbl/v2/agents/instructor';
import { applyQuizSignalsToProject } from '@/lib/pbl/v2/operations/runtime/quiz-snapshot';
import type { PBLProjectV2, PriorQuizResult } from '@/lib/pbl/v2/types';

const log = createLogger('PBL v2 OpenTask API');
import { readBoundedJson } from '@/lib/server/bounded-json';

/** Largest open-task request body, refused before it is buffered. Project plus task selection. */
const PBL_OPEN_TASK_MAX_BYTES = 1024 * 1024;

interface OpenTaskRequest {
  project: PBLProjectV2;
  phase: 'greeting' | 'setup';
  /** Optional pre-play quiz snapshot piggybacked from the Hero when
   *  the learner first opens the project. Folded into
   *  `project.proficiencyAssessment` before the Instructor runs. */
  priorQuizResults?: PriorQuizResult[];
}

export async function POST(req: NextRequest) {
  const denied = await requireSpender(req.headers);
  if (denied) return denied;

  const openTaskRead = await readBoundedJson(req, PBL_OPEN_TASK_MAX_BYTES);
  if (!openTaskRead.ok) {
    return openTaskRead.code === 'PAYLOAD_TOO_LARGE'
      ? apiError('PAYLOAD_TOO_LARGE', 413, `request body exceeds ${PBL_OPEN_TASK_MAX_BYTES} bytes`)
      : apiError('INVALID_REQUEST', 400, 'Request body must be valid JSON.');
  }
  const body: OpenTaskRequest = openTaskRead.value as OpenTaskRequest;

  if (!body?.project) {
    return apiError('MISSING_REQUIRED_FIELD', 400, '`project` is required.');
  }
  if (body.phase !== 'greeting' && body.phase !== 'setup') {
    return apiError('INVALID_REQUEST', 400, "`phase` must be 'greeting' or 'setup'.");
  }

  let resolved;
  try {
    resolved = await resolveModelFromRequest(req, body, 'pbl-v2-runtime:open-task');
  } catch (err) {
    const authorization = modelAuthorizationResponse(err);
    if (authorization) return authorization;
    log.error('Model resolution failed:', err);
    return apiError('INVALID_REQUEST', 400, err instanceof Error ? err.message : String(err));
  }

  const { model, thinkingConfig, managedKey } = resolved;
  applyRequestLocaleToProject(req, body.project);

  // Stage 2 (pre-play) recalibration: fold prior-quiz accuracy into
  // the adaptive engine before the Instructor turn runs. Only fires
  // on the GREETING (first entry into the project) — the SETUP
  // phase already has the up-to-date assessment from the previous
  // turn's dynamic signals.
  if (body.phase === 'greeting' && body.priorQuizResults && body.priorQuizResults.length > 0) {
    const { updated, tierChanged } = applyQuizSignalsToProject(body.project, body.priorQuizResults);
    if (updated) {
      log.info(
        `Pre-play quiz recalibration: tier=${body.project.proficiency} ` +
          `tierChanged=${tierChanged} ` +
          `quizzes=${body.priorQuizResults.length}`,
      );
    }
  }

  return createSSEResponse(
    runInstructorTurn({
      project: body.project,
      userMessage: '',
      phase: body.phase,
      languageModel: model,
      thinkingConfig,
      signal: req.signal,
    }),
    { signal: req.signal, managedKey },
  );
}
