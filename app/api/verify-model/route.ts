import { clientKeysAllowed } from '@/lib/server/authz/provider-keys';
import { requireSpender } from '@/lib/server/authz/viewer';
import { NextRequest } from 'next/server';
import { resolveRequestOwner } from '@/lib/server/identity/resolve';
import {
  attachOwnerCookies,
  invalidOwnerCredentialResponse,
} from '@/lib/server/identity/with-owner';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModel } from '@/lib/server/resolve-model';
import { describeUnexpectedError } from '@/lib/server/error-summary';
import {
  savedLanguageModel,
  savedProviderRef,
  savedProviderResponse,
} from '@/lib/server/model-config/saved-provider';
import { callLLM } from '@/lib/ai/llm';
import { upstreamHttpStatus } from '@/lib/server/llm-error-response';
const log = createLogger('Verify Model');

export async function POST(req: NextRequest) {
  const denied = await requireSpender(req.headers);
  if (denied) return denied;

  const owner = await resolveRequestOwner(req);
  if (!owner.ok) return invalidOwnerCredentialResponse();
  return attachOwnerCookies(await verify(req), owner.setCookies);
}

async function verify(req: NextRequest) {
  let model: string | undefined;
  // Set once the operator's key is chosen. Upstream text from that key is never sent to the visitor.
  let managedKey = false;
  try {
    const body = await req.json();
    const { apiKey, baseUrl, providerType } = body;
    model = body.model;
    const keysAllowed = await clientKeysAllowed(req.headers);

    if (typeof model !== 'string' || !model.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Model name is required');
    }

    // The settings test a saved provider by its id (`provider`, with `model`
    // its model id): the server's configuration supplies key and endpoint.
    let languageModel;
    let savedRef: string | undefined;
    try {
      savedRef = savedProviderRef(body.provider, model);
      if (savedRef) {
        const saved = await savedLanguageModel(req, savedRef);
        languageModel = saved.model;
        managedKey = saved.managedKey;
      }
    } catch (error) {
      const refused = savedProviderResponse(error, 'language model');
      if (refused) return refused;
      return apiError(
        'INVALID_REQUEST',
        401,
        error instanceof Error ? error.message : String(error),
      );
    }
    if (savedRef) {
      model = savedRef;
    } else {
      // Parse model string and resolve server-side fallback
      try {
        const result = await resolveModel({
          modelString: model,
          apiKey: keysAllowed ? apiKey || '' : '',
          baseUrl: keysAllowed ? baseUrl || undefined : undefined,
          providerType,
        });
        languageModel = result.model;
        managedKey = result.managedKey;
      } catch (error) {
        const refused = savedProviderResponse(error, 'language model');
        if (refused) return refused;
        return apiError(
          'INVALID_REQUEST',
          401,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    if (!languageModel) return apiError('MISSING_MODEL', 400, 'Model name is required');

    // Send a minimal test message. Use the unified wrapper so compatible
    // providers can receive provider-specific request options.
    const { text } = await callLLM(
      {
        model: languageModel,
        prompt: 'Say "OK" if you can hear me.',
        maxOutputTokens: 64,
      },
      'verify-model',
      undefined,
      // Probe the exact model the user typed in — a fallback would report a
      // dead or mis-keyed model as healthy. The shared layer disables the
      // fallback for the 'verify-model' source automatically.
      { mode: 'disabled', enabled: false },
    );

    return apiSuccess({
      message: 'Connection successful',
      response: text,
    });
  } catch (error) {
    // With the operator's key, the log keeps a name, code and frame, not the upstream message.
    log.error(
      `Model verification failed [model=${JSON.stringify(model ?? 'unknown')}]:`,
      managedKey ? describeUnexpectedError(error) : error,
    );

    // Classify by the provider's HTTP status only. Error messages can carry the
    // provider's response body or transport detail, so they are logged above
    // and never returned.
    const status = upstreamHttpStatus(error);
    let errorMessage: string;
    if (status === 401 || status === 403) {
      errorMessage = 'API key is invalid or expired';
    } else if (status === 404) {
      errorMessage = 'Model not found or API endpoint error';
    } else if (status === 429) {
      errorMessage = 'API rate limit exceeded, please try again later';
    } else if (status !== undefined) {
      errorMessage = `API request failed (HTTP ${Math.floor(status / 100)}xx)`;
    } else {
      // Refused, unresolvable, timed-out, redirecting and policy-blocked
      // targets, and unreadable responses, all get the same answer.
      errorMessage = 'Cannot connect to API server, please check the Base URL';
    }

    return apiError('INTERNAL_ERROR', 500, errorMessage);
  }
}
