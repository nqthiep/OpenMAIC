/**
 * Video Generation API
 *
 * Generates a video from a text prompt using the specified provider.
 * Uses the async task pattern (submit → poll).
 *
 * POST /api/generate/video
 *
 * The provider comes from the video slot of the model configuration. The
 * headers below are deprecated and count only while the slot is unassigned:
 *   x-video-provider, x-video-model, x-api-key, x-base-url
 *
 * Body: { prompt, duration?, aspectRatio?, resolution? }
 * Response: { success: boolean, result?: VideoGenerationResult, error?: string }
 */
import { modelAuthorizationResponse } from '@/lib/server/api-response';

import { NextRequest } from 'next/server';
import { clientKeysAllowed } from '@/lib/server/authz/provider-keys';
import { requireSpender } from '@/lib/server/authz/viewer';
import {
  isServerConfiguredProvider,
  isServerProviderDisabled,
  resolveVideoApiKey,
  resolveVideoBaseUrl,
  resolveVideoModel,
} from '@/lib/server/provider-config';
import type { VideoProviderId, VideoGenerationOptions } from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { describeUnexpectedError } from '@/lib/server/error-summary';
import { apiError, apiSuccess, type ApiErrorCode } from '@/lib/server/api-response';
import { readBoundedJson } from '@/lib/server/bounded-json';
import { validateClientBaseUrl } from '@/lib/server/ssrf-guard';
import {
  mediaResolutionResponse,
  RequestedProviderRefusedError,
  resolveMediaSlot,
  type MediaConnection,
} from '@/lib/server/model-config/media';
import { requestWorkspaceId } from '@/lib/server/model-config/runtime';
import { StepRefusal } from '@/lib/server/generation/steps/context';
import { generateVideoStep, type VideoRefusal } from '@/lib/server/generation/steps/video';

const log = createLogger('VideoGeneration API');

/** Largest video-generation request body, refused before it is buffered. Prompt plus options. */
const VIDEO_REQUEST_MAX_BYTES = 1024 * 1024;

/** The route never resumes a provider task, so the connection never changes under one. */
const REFUSAL_RESPONSES: Record<
  Exclude<VideoRefusal, 'task-connection-changed'>,
  [ApiErrorCode, number]
> = {
  'missing-api-key': ['MISSING_API_KEY', 401],
  'missing-model': ['MISSING_MODEL', 400],
};

export async function POST(request: NextRequest) {
  const denied = await requireSpender(request.headers);
  if (denied) return denied;

  try {
    const read = await readBoundedJson(request, VIDEO_REQUEST_MAX_BYTES);
    if (!read.ok) {
      return read.code === 'PAYLOAD_TOO_LARGE'
        ? apiError(
            'PAYLOAD_TOO_LARGE',
            413,
            `request body exceeds ${VIDEO_REQUEST_MAX_BYTES} bytes`,
          )
        : apiError('INVALID_REQUEST', 400, 'request body must be valid JSON');
    }
    const body = read.value as VideoGenerationOptions;

    if (!body.prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }

    // The video slot decides; the provider a request names (x-video-provider
    // with its key and base URL, deprecated) counts only when it is unassigned.
    let connection: MediaConnection;
    try {
      connection = await resolveMediaSlot('video', {
        workspaceId: await requestWorkspaceId(request),
        legacyRequest: () => requestedVideoProvider(request),
      });
    } catch (error) {
      const refused = mediaResolutionResponse(error, 'Video generation');
      if (refused) return refused;
      throw error;
    }
    let result;
    try {
      result = await generateVideoStep(
        {
          options: body,
          connection,
          requestedModel: request.headers.get('x-video-model')?.trim() || undefined,
        },
        { log },
      );
    } catch (error) {
      if (!(error instanceof StepRefusal)) throw error;
      const [code, status] =
        REFUSAL_RESPONSES[error.reason as Exclude<VideoRefusal, 'task-connection-changed'>];
      return apiError(code, status, error.message);
    }

    return apiSuccess({ result });
  } catch (error) {
    const authorization = modelAuthorizationResponse(error);
    if (authorization) return authorization;
    const message = error instanceof Error ? error.message : String(error);
    // The provider's error text is logged only; the caller gets a fixed message
    // so an upstream body never reaches the response.
    // Detect content safety filter rejections (e.g. Seedance SensitiveContent errors)
    if (message.includes('SensitiveContent') || message.includes('sensitive information')) {
      log.warn(`Video blocked by content safety filter: ${message}`);
      return apiError(
        'CONTENT_SENSITIVE',
        400,
        'The video provider rejected this prompt under its content safety policy',
      );
    }
    // The provider's message may echo request details; the server log keeps a
    // summary (name/code/frame), not the raw upstream text.
    log.error(`Video generation failed: ${describeUnexpectedError(error)}`);
    return apiError('INTERNAL_ERROR', 500, 'Video generation failed');
  }
}

/**
 * The provider the request names with x-video-provider (deprecated), with the
 * key, base URL and model headers, or undefined when it names none.
 */
async function requestedVideoProvider(request: NextRequest): Promise<MediaConnection | undefined> {
  const providerId = request.headers.get('x-video-provider')?.trim() as VideoProviderId | undefined;
  if (!providerId) return undefined;
  // A force-disabled provider is off for everyone (#665).
  if (isServerProviderDisabled('video', providerId)) {
    throw new RequestedProviderRefusedError(
      apiError('PROVIDER_DISABLED', 403, 'This video provider is disabled by the server'),
    );
  }
  // Managed providers are admin-owned. Only an administrator's own key is used otherwise.
  const managed = isServerConfiguredProvider('video', providerId);
  const keysAllowed = !managed && (await clientKeysAllowed(request.headers));
  const clientApiKey = keysAllowed ? request.headers.get('x-api-key') || undefined : undefined;
  const clientBaseUrl = keysAllowed ? request.headers.get('x-base-url') || undefined : undefined;
  if (clientBaseUrl) {
    const ssrfError = await validateClientBaseUrl(clientBaseUrl);
    if (ssrfError) throw new RequestedProviderRefusedError(apiError('INVALID_URL', 403, ssrfError));
  }
  // A managed provider may pin its model list server-side
  // (VIDEO_<PREFIX>_MODELS): an allowlisted client choice wins, otherwise the
  // first pinned entry is the managed default.
  const model = resolveVideoModel(
    providerId,
    request.headers.get('x-video-model')?.trim() || undefined,
  );
  return {
    providerId,
    apiKey: resolveVideoApiKey(providerId, clientApiKey),
    ...(model ? { modelId: model } : {}),
    baseUrl: resolveVideoBaseUrl(providerId, clientBaseUrl),
    managed,
    userEndpoint: Boolean(clientBaseUrl),
    origin: 'request',
  };
}
