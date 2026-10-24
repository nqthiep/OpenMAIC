/**
 * Single TTS Generation API
 *
 * Generates TTS audio for a single text string and returns base64-encoded audio.
 * Called by the client in parallel for each speech action after a scene is generated.
 * The synthesis is the narration step (lib/server/generation/steps/narration.ts).
 *
 * POST /api/generate/tts
 */

import { NextRequest } from 'next/server';
import { clientKeysAllowed } from '@/lib/server/authz/provider-keys';
import { requireSpender } from '@/lib/server/authz/viewer';
import {
  QwenTTSError,
  TTSInvalidResponseError,
  TTSRateLimitError,
} from '@/lib/audio/tts-providers';
import {
  isServerConfiguredProvider,
  isServerTTSProviderDisabled,
  resolveTTSApiKey,
  resolveTTSBaseUrl,
  TTSModelNotAllowedError,
} from '@/lib/server/provider-config';
import type { TTSProviderId } from '@/lib/audio/types';
import { createLogger } from '@/lib/logger';
import {
  describeUnexpectedError,
  MODEL_FAILURE_TEXT,
  visitorErrorText,
} from '@/lib/server/error-summary';
import { readBoundedJson } from '@/lib/server/bounded-json';
import { apiError, apiSuccess, type ApiErrorCode } from '@/lib/server/api-response';
import { findUnsafeNetworkTargetError, validatePublicUrlForSSRF } from '@/lib/server/ssrf-guard';
import { QwenVoiceCloneError, qwenVoiceCloneErrorMessage } from '@/lib/audio/qwen-voice-clone';
import {
  RequestedProviderRefusedError,
  resolveMediaSlot,
  type MediaConnection,
} from '@/lib/server/model-config/media';
import { requestWorkspaceId } from '@/lib/server/model-config/runtime';
import {
  savedMediaConnection,
  savedProviderRef,
  savedProviderResponse,
} from '@/lib/server/model-config/saved-provider';
import { StepRefusal } from '@/lib/server/generation/steps/context';
import {
  synthesizeNarration,
  type NarrationRefusal,
} from '@/lib/server/generation/steps/narration';

const log = createLogger('TTS API');

/** Largest TTS request body, refused before it is buffered. Narration text plus options. */
const TTS_REQUEST_MAX_BYTES = 1024 * 1024;

/** Every narration refusal is the request's to fix. */
const REFUSAL_CODES: Record<NarrationRefusal, ApiErrorCode> = {
  'voice-missing': 'MISSING_REQUIRED_FIELD',
  'client-side-provider': 'INVALID_REQUEST',
  'voice-context-required': 'VOXCPM_AUTO_VOICE_REQUIRES_CONTEXT',
  'missing-api-key': 'MISSING_API_KEY',
};

export async function POST(req: NextRequest) {
  const denied = await requireSpender(req.headers);
  if (denied) return denied;

  // The provider and voice the narration resolves, for the failure log.
  const trace: { providerId?: string; voice?: string } = {};
  let audioId: string | undefined;
  let managed = false;
  try {
    const read = await readBoundedJson(req, TTS_REQUEST_MAX_BYTES);
    if (!read.ok) {
      return read.code === 'PAYLOAD_TOO_LARGE'
        ? apiError('PAYLOAD_TOO_LARGE', 413, `request body exceeds ${TTS_REQUEST_MAX_BYTES} bytes`)
        : apiError('INVALID_REQUEST', 400, 'request body must be valid JSON');
    }
    const body = read.value as {
      text: string;
      audioId: string;
      ttsProviderId: TTSProviderId;
      ttsModelId?: string;
      ttsVoice: string;
      ttsSpeed?: number;
      ttsApiKey?: string;
      ttsBaseUrl?: string;
      ttsProviderOptions?: Record<string, unknown>;
      previewProvider?: unknown;
      previewModel?: unknown;
    };
    const { text, ttsModelId, ttsSpeed, ttsApiKey, ttsBaseUrl, ttsProviderOptions } = body;
    // Only an account allowed to bring its own key may send one (clientKeysAllowed).
    const keysAllowed = await clientKeysAllowed(req.headers);
    const requestedProviderId =
      typeof body.ttsProviderId === 'string' && body.ttsProviderId ? body.ttsProviderId : undefined;
    const requestedVoice = typeof body.ttsVoice === 'string' ? body.ttsVoice.trim() : undefined;
    audioId = body.audioId;

    // A voice that is sent must say something; an absent one means the default.
    if (!text || !audioId || (body.ttsVoice !== undefined && !requestedVoice)) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'Missing required fields: text, audioId (and a non-empty ttsVoice when sent)',
      );
    }

    // The tts slot decides; the provider, key and base URL a request names
    // (deprecated) count only when it is unassigned.
    // A settings preview names a saved provider instead (`previewProvider`,
    // with an optional `previewModel`): the server's configuration of it.
    let connection: MediaConnection;
    try {
      const preview = savedProviderRef(body.previewProvider, body.previewModel);
      connection = preview
        ? await savedMediaConnection(req, 'tts', preview)
        : await resolveMediaSlot('tts', {
            workspaceId: await requestWorkspaceId(req),
            legacyRequest: async () =>
              requestedProviderId
                ? requestedTTSProvider(requestedProviderId, keysAllowed, ttsApiKey, ttsBaseUrl)
                : undefined,
          });
    } catch (error) {
      const refused = savedProviderResponse(error, 'Text to speech');
      if (refused) return refused;
      throw error;
    }
    managed = connection.managed;
    const narration = await synthesizeNarration(
      {
        text,
        audioId,
        connection,
        requestedProviderId,
        requestedVoice,
        requestedModelId: ttsModelId,
        speed: ttsSpeed,
        providerOptions: ttsProviderOptions,
        trace,
      },
      { log },
    );

    // Convert to base64
    const base64 = Buffer.from(narration.audio).toString('base64');

    return apiSuccess({
      audioId,
      base64,
      format: narration.format,
    });
  } catch (error) {
    if (error instanceof StepRefusal) {
      return apiError(REFUSAL_CODES[error.reason as NarrationRefusal], 400, error.message);
    }
    log.error(
      `TTS generation failed [provider=${trace.providerId ?? 'unknown'}, voice=${trace.voice ?? 'unknown'}, audioId=${audioId ?? 'unknown'}]: ${describeUnexpectedError(error)}`,
    );
    const blocked = findUnsafeNetworkTargetError(error);
    if (blocked) {
      return apiError('INVALID_URL', 403, blocked.message);
    }
    if (error instanceof TTSRateLimitError) {
      return apiError('RATE_LIMITED', 429, visitorErrorText(error, managed, MODEL_FAILURE_TEXT));
    }
    if (error instanceof TTSInvalidResponseError) {
      return apiError(error.code, error.httpStatus, error.message);
    }
    if (error instanceof QwenVoiceCloneError) {
      return apiError(error.code, error.httpStatus || 502, qwenVoiceCloneErrorMessage(error));
    }
    if (error instanceof QwenTTSError) {
      return apiError(
        error.code,
        error.httpStatus,
        visitorErrorText(error, managed, MODEL_FAILURE_TEXT),
      );
    }
    if (error instanceof TTSModelNotAllowedError) {
      return apiError(error.code, error.httpStatus, error.message);
    }
    return apiError('GENERATION_FAILED', 500, visitorErrorText(error, managed, MODEL_FAILURE_TEXT));
  }
}

/**
 * The TTS provider a request names in its body (deprecated), with the key and
 * base URL it sends for an unmanaged provider.
 */
async function requestedTTSProvider(
  providerId: string,
  keysAllowed: boolean,
  clientApiKey: string | undefined,
  clientBaseUrl: string | undefined,
): Promise<MediaConnection> {
  // A force-disabled provider is off for everyone (#665).
  if (isServerTTSProviderDisabled(providerId)) {
    throw new RequestedProviderRefusedError(
      apiError('PROVIDER_DISABLED', 403, 'This TTS provider is disabled by the server'),
    );
  }
  // Managed providers are admin-owned: ignore any client-sent key/baseUrl.
  const managed = isServerConfiguredProvider('tts', providerId);
  const baseUrlFromClient = managed || !keysAllowed ? undefined : clientBaseUrl || undefined;
  if (baseUrlFromClient) {
    const ssrfError = await validatePublicUrlForSSRF(baseUrlFromClient);
    if (ssrfError) throw new RequestedProviderRefusedError(apiError('INVALID_URL', 403, ssrfError));
  }
  const baseUrl = resolveTTSBaseUrl(providerId, baseUrlFromClient);
  return {
    providerId,
    apiKey: resolveTTSApiKey(
      providerId,
      managed || !keysAllowed ? undefined : clientApiKey || undefined,
    ),
    ...(baseUrl ? { baseUrl } : {}),
    managed,
    userEndpoint: Boolean(baseUrlFromClient),
    origin: 'request',
  };
}
