import { clientKeysAllowed } from '@/lib/server/authz/provider-keys';
import { requireSpender } from '@/lib/server/authz/viewer';
/**
 * Web Search API
 *
 * POST /api/web-search
 * Simple JSON request/response using the configured web search provider.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { formatSearchResultsAsContext, searchWeb } from '@/lib/web-search';
import {
  isServerConfiguredProvider,
  isServerProviderDisabled,
  resolveServerWebSearchProviderId,
  resolveWebSearchApiKey,
  resolveWebSearchModel,
} from '@/lib/server/provider-config';
import { createLogger } from '@/lib/logger';
import {
  MODEL_FAILURE_TEXT,
  describeUnexpectedError,
  visitorErrorText,
} from '@/lib/server/error-summary';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  buildSearchQuery,
  SEARCH_QUERY_REWRITE_EXCERPT_LENGTH,
} from '@/lib/server/search-query-builder';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import type { AICallFn } from '@openmaic/generation';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search/constants';
import type { BaiduSubSources, WebSearchProviderId } from '@/lib/web-search/types';
import { resolveWebSearchRouteBaseUrl } from '@/lib/server/web-search-config';

const log = createLogger('WebSearch');

export async function POST(req: NextRequest) {
  const denied = await requireSpender(req.headers);
  if (denied) return denied;

  let query: string | undefined;
  let managed = false;
  try {
    const body = await req.json();
    const {
      query: requestQuery,
      pdfText,
      providerId: requestProviderId,
      apiKey: bodyApiKey,
      baseUrl: bodyBaseUrl,
      baiduSubSources,
      claudeModelId,
    } = body as {
      query?: string;
      pdfText?: string;
      providerId?: WebSearchProviderId;
      apiKey?: string;
      baseUrl?: string;
      baiduSubSources?: BaiduSubSources;
      claudeModelId?: string;
    };
    query = requestQuery;

    if (!query || !query.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'query is required');
    }

    const serverProviderId = resolveServerWebSearchProviderId() as WebSearchProviderId | undefined;
    let providerId: WebSearchProviderId =
      requestProviderId && WEB_SEARCH_PROVIDERS[requestProviderId]
        ? requestProviderId
        : (serverProviderId ?? 'tavily');

    // Prefer the operator's server-configured backend over stale client defaults
    // (e.g. Tavily without a key, or Brave HTML scrape with empty results).
    if (
      serverProviderId &&
      isServerConfiguredProvider('webSearch', serverProviderId) &&
      providerId !== serverProviderId &&
      !isServerConfiguredProvider('webSearch', providerId)
    ) {
      log.info(
        `Using server-configured web search provider "${serverProviderId}" instead of "${providerId}"`,
      );
      providerId = serverProviderId;
    }

    // Enforce server precedence: a force-disabled provider is off for everyone,
    // regardless of any client key/selection — mirror the TTS contract (#665).
    // Checked after the server-preference override so a disabled client choice
    // yields to the operator's enabled backend.
    if (isServerProviderDisabled('webSearch', providerId)) {
      return apiError(
        'PROVIDER_DISABLED',
        403,
        'This web search provider is disabled by the server',
      );
    }

    const provider = WEB_SEARCH_PROVIDERS[providerId];
    // Managed providers are admin-owned: ignore (don't reject) any client-sent
    // key/baseUrl. The server config is authoritative, so a stale client base
    // URL is dropped rather than failing the request.
    managed = isServerConfiguredProvider('webSearch', providerId);
    const keysAllowed = !managed && (await clientKeysAllowed(req.headers));
    const clientApiKey = keysAllowed ? bodyApiKey : undefined;
    // SearXNG base URLs are operator-managed only (set in the Settings popup (top bar)); never trust client input.
    const clientBaseUrl = keysAllowed && providerId !== 'searxng' ? bodyBaseUrl : undefined;
    const apiKey = resolveWebSearchApiKey(providerId, clientApiKey);
    if (provider.requiresApiKey && !apiKey) {
      return apiError(
        'MISSING_API_KEY',
        400,
        `${provider.name} API key is not configured. Set it in Settings -> Web Search (an administrator can also add a shared server key there).`,
      );
    }
    let baseUrl: string | undefined;
    try {
      baseUrl = resolveWebSearchRouteBaseUrl(providerId, clientBaseUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid web search base URL';
      return apiError('INVALID_REQUEST', 400, message);
    }
    if (provider.requiresBaseUrl && !baseUrl) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        getMissingBaseUrlMessage(providerId, provider.name),
      );
    }

    // Clamp rewrite input at the route boundary; framework body limits still apply to total request size.
    const boundedPdfText = pdfText?.slice(0, SEARCH_QUERY_REWRITE_EXCERPT_LENGTH);

    let aiCall: AICallFn | undefined;
    try {
      const { model: languageModel, thinkingConfig } = await resolveModelFromRequest(
        req,
        body,
        'web-search-query-rewrite',
      );
      aiCall = async (systemPrompt, userPrompt) => {
        const result = await callLLM(
          {
            model: languageModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            maxOutputTokens: 256,
          },
          'web-search-query-rewrite',
          undefined,
          thinkingConfig,
        );
        return result.text;
      };
    } catch (error) {
      log.warn(
        `Search query rewrite model unavailable, falling back to raw requirement: ${describeUnexpectedError(error)}`,
      );
    }

    const searchQuery = await buildSearchQuery(query, boundedPdfText, aiCall);

    log.info('Running web search API request', {
      hasPdfContext: searchQuery.hasPdfContext,
      rawRequirementLength: searchQuery.rawRequirementLength,
      rewriteAttempted: searchQuery.rewriteAttempted,
      finalQueryLength: searchQuery.finalQueryLength,
    });

    const result = await searchWeb({
      providerId,
      query: searchQuery.query,
      apiKey,
      baseUrl,
      ...(providerId === 'baidu' && baiduSubSources ? { baiduSubSources } : {}),
      // A server-pinned model (WEB_SEARCH_CLAUDE_MODELS) is authoritative over
      // the client-selected one, matching how managed keys/base URLs behave.
      ...(providerId === 'claude'
        ? { claudeModelId: resolveWebSearchModel('claude', claudeModelId) }
        : {}),
    });
    const context = formatSearchResultsAsContext(result);

    return apiSuccess({
      answer: result.answer,
      sources: result.sources,
      context,
      query: result.query,
      responseTime: result.responseTime,
    });
  } catch (err) {
    log.error(
      `Web search failed [queryLength=${query?.length ?? 'unknown'}]: ${describeUnexpectedError(err)}`,
    );
    const message = visitorErrorText(err, managed, MODEL_FAILURE_TEXT);
    return apiError('INTERNAL_ERROR', 500, message);
  }
}

function getMissingBaseUrlMessage(providerId: WebSearchProviderId, providerName: string): string {
  if (providerId === 'searxng') {
    return `${providerName} base URL is not configured. An administrator must add it as a shared server credential.`;
  }
  return `${providerName} base URL is not configured. Configure the base URL in Settings -> Web Search (an administrator can also add a shared server credential there).`;
}
