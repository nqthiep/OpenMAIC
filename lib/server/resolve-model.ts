/**
 * Shared model resolution utilities for API routes.
 *
 * Extracts the repeated parseModelString → resolveApiKey → resolveBaseUrl →
 * resolveProxy → getModel boilerplate into a single call.
 */

import type { NextRequest } from 'next/server';
import { getModel, getProvider, parseModelString, type ModelWithInfo } from '@/lib/ai/providers';
import type { ModelInfo, ProviderType, ThinkingConfig } from '@/lib/types/provider';
import { clientKeysAllowed } from '@/lib/server/authz/provider-keys';
import {
  isServerConfiguredProvider,
  resolveApiKey,
  resolveBaseUrl,
  resolveProxy,
} from '@/lib/server/provider-config';
import { validateClientBaseUrl, validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { fetchWithRedirectValidation } from '@/lib/server/fetch-with-redirect-validation';
import { clientBaseUrlLlmFetch } from '@/lib/server/llm-provider-fetch';
import {
  getDefaultModel,
  getDefaultRoute,
  getStageRoute,
  getUserStageRoute,
  parseUserStageRoutes,
  type LlmStage,
  type StageRoute,
  type UserStageRoute,
} from '@/lib/server/model-routes';

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
  /**
   * Whether the primary model was chosen by the SERVER rather than the client:
   * an operator MODEL_ROUTES/DEFAULT_MODEL resolution (env route) or a
   * server-configured provider (managed key). User-level routes (the
   * 「课程模型配置」 per-stage selection) are USER choices — even though they
   * route the stage, they are not server-managed. Only server-managed
   * primaries may arm the retryable-failure fallback in callLLM: a
   * client-supplied model with a garbage key must never be allowed to burn the
   * operator's fallback key. Callers pass this through to callLLM's
   * `fallbackOptions.serverManaged`.
   */
  serverManaged: boolean;
}

/**
 * Model info for a model the provider catalog does not describe (a gateway lists none), from what
 * the route that picked it says. The catalog wins whenever it knows the model, and a route only
 * speaks for its own model string.
 */
function modelInfoFromRoute(
  route: StageRoute | undefined,
  modelString: string,
  modelId: string,
): ModelInfo | null {
  if (!route || route.model !== modelString) return null;
  if (
    route.vision === undefined &&
    route.tools === undefined &&
    route.contextWindow === undefined
  ) {
    return null;
  }
  return {
    id: modelId,
    name: modelId,
    ...(route.contextWindow ? { contextWindow: route.contextWindow } : {}),
    capabilities: { streaming: true, vision: route.vision ?? false, tools: route.tools ?? false },
  };
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
  /**
   * User-level per-stage routes (parsed from the `x-model-routes` header by
   * resolveModelFromHeaders/FromRequest). Precedence: operator MODEL_ROUTES >
   * these user routes > x-model > DEFAULT_MODEL. A user route carries its own
   * connection params (apiKey/baseUrl/providerType) for the routed provider;
   * server-managed providers still resolve credentials authoritatively.
   */
  userRoutes?: Record<string, UserStageRoute>;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
  thinkingConfig?: ThinkingConfig;
}): Promise<ResolvedModel> {
  // Resolution order: stage route > user stage route > x-model > the default model.
  // A configured stage route is the operator's deliberate per-stage choice and
  // wins even over a client-sent x-model (otherwise the browser UI, which always
  // sends its saved model, would shadow every route). User routes (an administrator's
  // own per-stage selection in the course model settings) sit just below operator
  // routes and above the client's main-model x-model. Unrouted stages fall back
  // to the client x-model, then the default model. There is intentionally no hardcoded
  // model fallback — if nothing resolves we fail loud rather than silently pick a
  // vendor default.
  const envRoute = getStageRoute(params.stage);
  const userRoute = envRoute ? undefined : getUserStageRoute(params.userRoutes ?? {}, params.stage);
  const stageRoute: UserStageRoute | undefined = envRoute ?? userRoute;
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
  // A routed model resolves purely from server config, as if no x-model was sent
  // — except a *user* route, which supplies its own connection for the routed
  // provider (server-managed providers ignore it regardless).
  const routed = Boolean(stageModel);
  const clientApiKey = routed ? userRoute?.apiKey : params.apiKey;
  const clientProviderType = routed ? userRoute?.providerType : params.providerType;
  const clientBaseUrlParam = routed ? userRoute?.baseUrl : params.baseUrl;

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
  // An unmanaged provider's endpoint is the caller's choice whenever the caller
  // picked the model (x-model or a user route) or sent a base URL: either the
  // client-supplied URL or the provider's catalog default (e.g. a localhost
  // Ollama). Only a model the operator selected (MODEL_ROUTES or
  // DEFAULT_MODEL) with no client base URL resolves purely from server config.
  const operatorSelected = Boolean(envRoute) || (!userRoute && !params.modelString);
  const clientEndpoint = !managed && (Boolean(clientBaseUrl) || !operatorSelected);
  const endpointUrl = clientBaseUrl ?? getProvider(providerId)?.defaultBaseUrl;
  if (clientEndpoint && endpointUrl) {
    const ssrfError = clientBaseUrl
      ? await validateClientBaseUrl(clientBaseUrl)
      : await validateUrlForSSRF(endpointUrl);
    if (ssrfError) {
      throw new Error(ssrfError);
    }
  }

  const apiKey = resolveApiKey(providerId, clientApiKey || '');
  const baseUrl = resolveBaseUrl(providerId, clientBaseUrl);
  const proxy = resolveProxy(providerId);
  const { model, modelInfo: catalogInfo } = getModel({
    providerId,
    modelId,
    apiKey,
    baseUrl,
    proxy,
    providerType: clientProviderType as ProviderType | undefined,
    // A caller-chosen endpoint is pinned and refuses redirects (see
    // lib/server/llm-provider-fetch.ts). Operator-configured endpoints keep the
    // transport that re-validates every redirect hop.
    fetchImpl: clientEndpoint ? clientBaseUrlLlmFetch : fetchWithRedirectValidation,
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

  // The route that chose this model, if one did: the stage's, or the default model's.
  const chosenBy = stageModel ? stageRoute : params.modelString ? undefined : getDefaultRoute();
  const modelInfo = catalogInfo ?? modelInfoFromRoute(chosenBy, modelString, modelId);

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
    // An operator route or the default model pick is the operator's choice, and a
    // server-configured provider key is operator-owned — either way the primary is
    // server-managed and may arm the fallback. A user-level route or a plain client
    // x-model on an unmanaged provider is NOT server-managed.
    serverManaged: Boolean(envRoute) || managed,
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
 * Reads: x-model, x-api-key, x-base-url, x-provider-type, x-model-routes. The key, the base URL
 * and the routes are used only for an administrator's own settings; other callers get the
 * server's providers.
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
    userRoutes: keysAllowed ? parseUserStageRoutes(req.headers.get('x-model-routes')) : undefined,
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
