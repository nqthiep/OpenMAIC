/**
 * Shared model resolution utilities for API routes.
 *
 * Extracts the repeated parseModelString → resolveApiKey → resolveBaseUrl →
 * resolveProxy → getModel boilerplate into a single call.
 */

import type { NextRequest } from 'next/server';
import { getModel, getProvider, parseModelString, type ModelWithInfo } from '@/lib/ai/providers';
import type { ProviderType, ThinkingConfig } from '@/lib/types/provider';
import { clientKeysAllowed } from '@/lib/server/authz/provider-keys';
import {
  isServerConfiguredProvider,
  resolveApiKey,
  resolveBaseUrl,
  resolveProxy,
} from '@/lib/server/provider-config';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { fetchWithRedirectValidation } from '@/lib/server/fetch-with-redirect-validation';
import { getDefaultModel, getStageRoute, type LlmStage } from '@/lib/server/model-routes';

export interface ResolvedModel extends ModelWithInfo {
  /** True when the operator's key is in use. Its upstream error text must not reach a visitor. */
  managedKey: boolean;
  /** Original model string (e.g. "openai/gpt-4o-mini") */
  modelString: string;
  /** Resolved provider ID (e.g. "openai", "ollama") */
  providerId: string;
  /** Resolved model ID (e.g. "gpt-4o-mini") */
  modelId: string;
  /** Effective API key after server-side fallback resolution */
  apiKey: string;
  /** Effective base URL after server/client resolution */
  baseUrl?: string;
  /** Optional per-request thinking configuration from the client. */
  thinkingConfig?: ThinkingConfig;
}

/**
 * Resolve a language model from explicit parameters.
 *
 * Use this when model config comes from the request body.
 */
export async function resolveModel(params: {
  modelString?: string;
  /**
   * Optional generation stage (a `callLLM` source label, e.g. 'scene-content').
   * When set and a route is configured in the model routing settings, the route wins for
   * this call — even over a client-sent `modelString` (x-model). Unrouted
   * stages fall back to `modelString` then the default model. See
   * lib/server/model-routes.ts.
   */
  stage?: LlmStage;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
  thinkingConfig?: ThinkingConfig;
}): Promise<ResolvedModel> {
  // Resolution order: stage route > x-model > the default model.
  // A configured stage route is the operator's deliberate per-stage choice and
  // wins even over a client-sent x-model (otherwise the browser UI, which always
  // sends its saved model, would shadow every route). Unrouted stages fall back
  // to the client x-model, then the default model. There is intentionally no hardcoded
  // model fallback — if nothing resolves we fail loud rather than silently pick a
  // vendor default.
  const stageRoute = getStageRoute(params.stage);
  const stageModel = stageRoute?.model;
  const modelString = stageModel || params.modelString || getDefaultModel();
  if (!modelString) {
    throw new Error(
      'No model could be resolved. Set the default model (and/or a route for this stage) in the Settings popup (top bar), or send a model via x-model.',
    );
  }
  const { providerId, modelId } = parseModelString(modelString);

  // When a stage route overrides the client's model, the client-sent connection
  // params (apiKey/baseUrl/providerType) belong to the client's *other* model
  // and must not bleed onto the routed provider — otherwise e.g. a routed
  // Anthropic model would be built with the client's OpenAI providerType/key.
  // A routed model resolves purely from server config, as if no x-model was sent.
  const routed = Boolean(stageModel);
  const clientApiKey = routed ? undefined : params.apiKey;
  const clientProviderType = routed ? undefined : params.providerType;
  const clientBaseUrlParam = routed ? undefined : params.baseUrl;

  // Server-managed providers are admin-owned: the operator's key and base URL
  // are authoritative and any client-sent override is ignored. Origin URL
  // validation therefore applies only to unmanaged providers, where the base
  // URL really is client-supplied. (Server-configured URLs are trusted by the
  // operator.) Every provider fetch still runs through a transport that
  // re-validates redirect hops: no upstream can be assumed to redirect only to
  // public targets, so the hop target is checked regardless of who chose the
  // origin.
  const managed = isServerConfiguredProvider('providers', providerId);
  const registeredProviderType = getProvider(providerId)?.type;
  if (
    clientProviderType &&
    registeredProviderType &&
    clientProviderType !== registeredProviderType
  ) {
    throw new Error(
      `Provider type mismatch for ${providerId}: expected ${registeredProviderType}, received ${clientProviderType}.`,
    );
  }
  const effectiveProviderType = (clientProviderType || registeredProviderType) as
    | ProviderType
    | undefined;
  if (effectiveProviderType === 'bedrock' && (providerId !== 'bedrock' || !managed)) {
    throw new Error('Amazon Bedrock must be enabled by the server operator before it can be used.');
  }
  const clientBaseUrl = managed ? undefined : clientBaseUrlParam || undefined;
  if (clientBaseUrl) {
    const ssrfError = await validateUrlForSSRF(clientBaseUrl);
    if (ssrfError) {
      throw new Error(ssrfError);
    }
  }

  const apiKey = resolveApiKey(providerId, clientApiKey || '');
  const baseUrl = resolveBaseUrl(providerId, clientBaseUrl);
  const proxy = resolveProxy(providerId);
  const { model, modelInfo } = getModel({
    providerId,
    modelId,
    apiKey,
    baseUrl,
    proxy,
    providerType: clientProviderType as ProviderType | undefined,
    // Re-validate every redirect hop of the outbound request (see
    // fetchWithRedirectValidation); the base URL above is checked at origin.
    fetchImpl: fetchWithRedirectValidation,
  });

  // Thinking arbitration mirrors model routing — the route carries a full
  // ThinkingConfig (mode/effort/level/enabled/budgetTokens/…) which callLLM
  // normalizes against the model's capability:
  //  - routed + thinking set → the route's thinking wins (over client thinking).
  //  - routed + no thinking  → routed model uses its own default; client thinking
  //    is dropped (it belonged to the client's other model).
  //  - unrouted              → honor the client's thinking config.
  const thinkingConfig: ThinkingConfig | undefined = routed
    ? stageRoute?.thinking
    : params.thinkingConfig;

  return {
    model,
    modelInfo,
    modelString,
    providerId,
    modelId,
    apiKey,
    baseUrl,
    thinkingConfig,
    // True when the operator's key is in use. Its upstream error text must not reach a visitor.
    managedKey: managed,
  };
}

function getThinkingConfigFromBody(body: unknown): ThinkingConfig | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as { thinkingConfig?: unknown; thinking?: unknown };
  const config = record.thinkingConfig ?? record.thinking;
  return config && typeof config === 'object' ? (config as ThinkingConfig) : undefined;
}

/**
 * Resolve a language model from standard request headers.
 *
 * Reads: x-model, x-api-key, x-base-url, x-provider-type. The key and base URL are used only
 * for an administrator's own key; other callers get the server's providers.
 * Note: requiresApiKey is derived server-side from the provider registry,
 * never from client headers, to prevent auth bypass.
 */
export async function resolveModelFromHeaders(
  req: NextRequest,
  stage?: LlmStage,
  thinkingConfig?: ThinkingConfig,
): Promise<ResolvedModel> {
  const keysAllowed = await clientKeysAllowed(req.headers);
  return resolveModel({
    modelString: req.headers.get('x-model') || undefined,
    stage,
    apiKey: keysAllowed ? req.headers.get('x-api-key') || undefined : undefined,
    baseUrl: keysAllowed ? req.headers.get('x-base-url') || undefined : undefined,
    providerType: req.headers.get('x-provider-type') || undefined,
    thinkingConfig,
  });
}

/**
 * Resolve a language model from standard request headers plus body fields.
 *
 * Reads model credentials from headers and per-request thinking config from
 * the JSON body field `thinkingConfig` (or legacy/eval field `thinking`).
 */
export async function resolveModelFromRequest(
  req: NextRequest,
  body: unknown,
  stage?: LlmStage,
): Promise<ResolvedModel> {
  // Pass the client's body thinking into resolveModel so the single arbiter
  // there decides (a routed stage may override or drop it). See resolveModel.
  return resolveModelFromHeaders(req, stage, getThinkingConfigFromBody(body));
}
