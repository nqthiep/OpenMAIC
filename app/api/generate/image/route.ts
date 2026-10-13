import { requireSpender } from '@/lib/server/authz/viewer';
/**
 * Image Generation API
 *
 * Generates an image from a text prompt using the specified provider.
 * Called by the client during media generation after slides are produced.
 *
 * POST /api/generate/image
 *
 * Headers:
 *   x-image-provider: ImageProviderId (optional, server-configured default)
 *   x-api-key: string (optional, server fallback)
 *   x-base-url: string (optional, server fallback)
 *
 * Body: { prompt, negativePrompt?, width?, height?, aspectRatio?, style? }
 * Response: { success: boolean, result?: ImageGenerationResult, error?: string }
 */

import { NextRequest } from 'next/server';
import { recordGenerationUsage } from '@/lib/server/usage-storage';
import { generateImage, IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import {
  isServerConfiguredProvider,
  isServerProviderDisabled,
  resolveImageApiKey,
  resolveImageBaseUrl,
  resolveImageModel,
  resolveServerImageProviderId,
} from '@/lib/server/provider-config';
import type { ImageProviderId, ImageGenerationOptions } from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { CONTENT_BLOCKED_TEXT, MODEL_FAILURE_TEXT } from '@/lib/server/error-summary';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { resolveImageSize } from '@/lib/server/image-sizing';
import { readBoundedJson } from '@/lib/server/bounded-json';

const log = createLogger('ImageGeneration API');

/** Largest image-generation request body, refused before it is buffered. Prompt plus options. */
const IMAGE_REQUEST_MAX_BYTES = 1024 * 1024;

// The ComfyUI adapter polls up to GENERATION_TIMEOUT_MS (5 min) and real
// workflows can take 3–5 min. 60s would let platforms that enforce maxDuration
// (e.g. Vercel) kill the request ~4 min before the adapter finishes. 300s is
// the practical ceiling on most managed platforms and matches the poll budget.
// (Self-hosted Node servers ignore this value entirely.)
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireSpender(request.headers);
  if (denied) return denied;

  let managed = false;
  try {
    const read = await readBoundedJson(request, IMAGE_REQUEST_MAX_BYTES);
    if (!read.ok) {
      return read.code === 'PAYLOAD_TOO_LARGE'
        ? apiError(
            'PAYLOAD_TOO_LARGE',
            413,
            `request body exceeds ${IMAGE_REQUEST_MAX_BYTES} bytes`,
          )
        : apiError('INVALID_REQUEST', 400, 'request body must be valid JSON');
    }
    const body = read.value as ImageGenerationOptions;

    if (!body.prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }

    // The client may express no provider preference (empty header) — fall back
    // to the first server-configured image provider, else fail loud.
    const providerId = (request.headers.get('x-image-provider')?.trim() ||
      resolveServerImageProviderId()) as ImageProviderId;
    if (!providerId) {
      return apiError('MISSING_PROVIDER', 400, 'No image provider configured');
    }
    // Enforce server precedence: a force-disabled provider is off for everyone,
    // regardless of any client key/selection — mirror the TTS contract (#665).
    if (isServerProviderDisabled('image', providerId)) {
      return apiError('PROVIDER_DISABLED', 403, 'This image provider is disabled by the server');
    }
    // Managed providers are admin-owned: ignore any client-sent key/baseUrl.
    managed = isServerConfiguredProvider('image', providerId);
    const clientApiKey = managed ? undefined : request.headers.get('x-api-key') || undefined;
    const clientBaseUrl = managed ? undefined : request.headers.get('x-base-url') || undefined;
    const clientModel = request.headers.get('x-image-model')?.trim() || undefined;

    if (clientBaseUrl) {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const apiKey = resolveImageApiKey(providerId, clientApiKey);
    const provider = IMAGE_PROVIDERS[providerId];
    if (provider?.requiresApiKey && !apiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        `No API key configured for image provider: ${providerId}`,
      );
    }

    const baseUrl = resolveImageBaseUrl(providerId, clientBaseUrl);

    // A managed provider may pin its model list server-side
    // (IMAGE_<PREFIX>_MODELS): an allowlisted client choice wins, otherwise the
    // first pinned entry is the managed default; unmanaged providers use the
    // client header directly.
    const model = resolveImageModel(providerId, clientModel);
    // Workflow-based providers (e.g. comfyui-image) have no model catalog and
    // need no model; everyone else must resolve one.
    if (!model && provider?.models && provider.models.length > 0) {
      return apiError(
        'MISSING_MODEL',
        400,
        `No model configured for image provider: ${providerId}`,
      );
    }

    const sizedOptions = resolveImageSize(body, { providerId, modelId: model });

    log.info(
      `Generating image: provider=${providerId}, model=${model || 'default'}, ` +
        `promptLength=${sizedOptions.prompt.length}, size=${sizedOptions.width ?? 'auto'}x${sizedOptions.height ?? 'auto'}`,
    );

    const result = await generateImage({ providerId, apiKey, baseUrl, model }, sizedOptions);

    void recordGenerationUsage({
      kind: 'image',
      unit: 'image',
      providerId,
      modelId: model,
      quantity: 1,
    });

    return apiSuccess({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Detect content safety filter rejections (e.g. Seedream OutputImageSensitiveContentDetected)
    if (message.includes('SensitiveContent') || message.includes('sensitive information')) {
      log.warn(`Image blocked by content safety filter: ${message}`);
      return apiError('CONTENT_SENSITIVE', 400, managed ? CONTENT_BLOCKED_TEXT : message);
    }
    log.error(`Image generation failed: ${message}`, error);
    return apiError('INTERNAL_ERROR', 500, managed ? MODEL_FAILURE_TEXT : message);
  }
}
