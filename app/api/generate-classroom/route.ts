import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { clientKeysAllowed } from '@/lib/server/authz/provider-keys';
import { requireSpender, resolveViewer } from '@/lib/server/authz/viewer';
import { type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import { createClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';
import { readBoundedJson } from '@/lib/server/bounded-json';

const log = createLogger('GenerateClassroom API');

export const maxDuration = 30;

/**
 * Largest classroom-generation input, refused before it is buffered. The
 * input carries a requirement plus optional PDF text.
 */
const GENERATE_CLASSROOM_MAX_BYTES = 10 * 1024 * 1024;

type PdfContent = NonNullable<GenerateClassroomInput['pdfContent']>;

function isValidPdfContent(value: unknown): value is PdfContent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const { text, images } = value as { text?: unknown; images?: unknown };
  return (
    typeof text === 'string' &&
    Array.isArray(images) &&
    images.every((item) => typeof item === 'string')
  );
}

export async function POST(req: NextRequest) {
  const denied = await requireSpender(req.headers);
  if (denied) return denied;

  let requirementLength: number | undefined;
  try {
    const read = await readBoundedJson(req, GENERATE_CLASSROOM_MAX_BYTES);
    if (!read.ok) {
      return read.code === 'PAYLOAD_TOO_LARGE'
        ? apiError(
            'PAYLOAD_TOO_LARGE',
            413,
            `request body exceeds ${GENERATE_CLASSROOM_MAX_BYTES} bytes`,
          )
        : apiError('INVALID_REQUEST', 400, 'request body must be valid JSON');
    }
    const rawBody = read.value as Partial<GenerateClassroomInput>;
    requirementLength = rawBody.requirement?.length;
    const pdfContent = rawBody.pdfContent;

    if (pdfContent !== undefined && !isValidPdfContent(pdfContent)) {
      return apiError(
        'INVALID_REQUEST',
        400,
        'Invalid pdfContent: expected { text: string; images: string[] }',
      );
    }

    // Only an administrator's own web-search key is used; others get the server's provider.
    const keysAllowed = await clientKeysAllowed(req.headers);

    const body: GenerateClassroomInput = {
      requirement: rawBody.requirement || '',
      ...(pdfContent !== undefined ? { pdfContent } : {}),

      ...(rawBody.enableWebSearch != null ? { enableWebSearch: rawBody.enableWebSearch } : {}),
      ...(rawBody.webSearchProviderId ? { webSearchProviderId: rawBody.webSearchProviderId } : {}),
      ...(keysAllowed && rawBody.webSearchApiKey
        ? { webSearchApiKey: rawBody.webSearchApiKey }
        : {}),
      ...(rawBody.webSearchModelId ? { webSearchModelId: rawBody.webSearchModelId } : {}),
      ...(rawBody.baiduSubSources ? { baiduSubSources: rawBody.baiduSubSources } : {}),
      ...(rawBody.enableImageGeneration != null
        ? { enableImageGeneration: rawBody.enableImageGeneration }
        : {}),
      ...(rawBody.enableVideoGeneration != null
        ? { enableVideoGeneration: rawBody.enableVideoGeneration }
        : {}),
      ...(rawBody.enableTTS != null ? { enableTTS: rawBody.enableTTS } : {}),
      ...(rawBody.agentMode ? { agentMode: rawBody.agentMode } : {}),
    };
    const { requirement } = body;

    if (!requirement) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: requirement');
    }

    const baseUrl = buildRequestOrigin(req);
    const jobId = nanoid(10);
    const viewer = await resolveViewer(req.headers);
    const job = await createClassroomGenerationJob(jobId, body, viewer.ownerId);
    const pollUrl = `${baseUrl}/api/generate-classroom/${jobId}`;

    after(() => runClassroomGenerationJob(jobId, body, baseUrl, viewer.ownerId));

    return apiSuccess(
      {
        jobId,
        status: job.status,
        step: job.step,
        message: job.message,
        pollUrl,
        pollIntervalMs: 5000,
      },
      202,
    );
  } catch (error) {
    log.error(
      `Classroom generation job creation failed [requirementLength=${requirementLength ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create classroom generation job',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
