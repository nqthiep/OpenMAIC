/**
 * Server-side Provider Configuration
 *
 * The providers the operator manages (API keys, base URLs, pinned models, switch-offs) live in the
 * database, in `provider_credentials`, edited in the Settings popup (administrator). This module is the synchronous
 * lookup layer over them: it reads the in-memory snapshot kept by `lib/server/provider-store`.
 * Keys never leave the server — only provider IDs and metadata are exposed via API.
 *
 * Without a database there are no managed providers and clients' own keys are used. While a
 * configured database has not been loaded yet, every lookup throws `ProviderConfigNotReady`.
 */

import {
  DEFAULT_QWEN_TTS_VOICE_CLONE_MODEL,
  isQwenCatalogVoice,
  isQwenVoiceCloneModel,
  TTS_PROVIDERS,
} from '@/lib/audio/constants';
import { registerLogSecret } from '@/lib/log-secrets';
import { currentSnapshot } from '@/lib/server/provider-store/snapshot';
import type {
  CapabilitySection,
  ProviderSection,
  ServerConfig,
  ServerProviderEntry,
} from '@/lib/server/provider-store/types';

const ALIDOCMIND_PROVIDER_ID = 'alidocmind';

function getConfig(): ServerConfig {
  return currentSnapshot().config;
}

/**
 * The operator's entry for a provider, or undefined. Provider ids come from requests, so only the
 * section's own keys count: an id such as `constructor` or `__proto__` must not resolve to an
 * inherited object property.
 */
function serverEntry(
  section: ProviderSection,
  providerId: string,
): ServerProviderEntry | undefined {
  const entries = getConfig()[section];
  return Object.hasOwn(entries, providerId) ? entries[providerId] : undefined;
}

// ---------------------------------------------------------------------------
// AliDocMind (Aliyun AccessKey pair instead of one API key)
// ---------------------------------------------------------------------------

/**
 * Server-owned AliDocMind AK/SK, if this deployment manages the provider.
 * Returns undefined when AliDocMind is not server-configured (client must
 * supply its own credentials).
 */
export function resolveManagedAliDocMindCredentials():
  | { accessKeyId: string; accessKeySecret: string; baseUrl?: string }
  | undefined {
  const entry = getConfig().pdf[ALIDOCMIND_PROVIDER_ID];
  if (entry?.accessKeyId && entry?.accessKeySecret) {
    return {
      accessKeyId: entry.accessKeyId,
      accessKeySecret: entry.accessKeySecret,
      baseUrl: entry.baseUrl,
    };
  }
  return undefined;
}

/** Provider-neutral extraction input populated from server-managed media credentials. */
export function resolveServerMediaExtractorConfig(): {
  providerId: string;
  accessKeyId?: string;
  accessKeySecret?: string;
  baseUrl?: string;
  allowEnvFallback: boolean;
} {
  const credentials = resolveManagedAliDocMindCredentials();
  return {
    providerId: '',
    accessKeyId: credentials?.accessKeyId,
    accessKeySecret: credentials?.accessKeySecret,
    baseUrl: credentials?.baseUrl,
    allowEnvFallback: false,
  };
}

// ---------------------------------------------------------------------------
// Managed-provider resolution
//
// A provider is "server-managed" iff the operator configured it (an entry is
// present in the server config). Managed providers are admin-owned and NOT
// overridable from the client: the server key and base URL are authoritative
// and any client-sent key/baseUrl is ignored. Unmanaged providers (the user's
// own custom credentials) resolve purely from the client value. This single
// rule removes the tri-state where a client base URL could partially override
// server config (the bug class #533 patched route-by-route).
// ---------------------------------------------------------------------------

/** Whether the operator configured this provider in the given section. */
export function isServerConfiguredProvider(section: ProviderSection, providerId: string): boolean {
  return serverEntry(section, providerId) !== undefined;
}

/** Whether the operator force-disabled this provider in the given capability section (server precedence). */
export function isServerProviderDisabled(section: CapabilitySection, providerId: string): boolean {
  return getConfig().disabled[section].has(providerId);
}

/**
 * Enabled-provider resolver: the provider IDs of a capability listing that
 * this deployment actually serves — present in the listing and not
 * force-disabled (`{ disabled: true }`, #665). The provider-config API
 * deliberately includes force-disabled providers so admin surfaces can show
 * them; every capability consumer (agent tool selectors and gates, server
 * default resolution) must resolve enabledness through this — disable wins.
 */
export function enabledProviderIds<T extends { disabled?: boolean }>(
  listing: Record<string, T>,
): string[] {
  return Object.keys(listing).filter((id) => !listing[id]?.disabled);
}

function resolveSectionApiKey(
  section: ProviderSection,
  providerId: string,
  clientKey?: string,
): string {
  const entry = serverEntry(section, providerId);
  if (entry) return entry.apiKey || ''; // managed: server key is authoritative
  return clientKey || ''; // unmanaged: client-supplied key only
}

function resolveSectionBaseUrl(
  section: ProviderSection,
  providerId: string,
  clientBaseUrl?: string,
): string | undefined {
  const entry = serverEntry(section, providerId);
  if (entry) return entry.baseUrl; // managed: server base URL is authoritative
  return clientBaseUrl; // unmanaged: client-supplied base URL only
}

// ---------------------------------------------------------------------------
// Public API — LLM
// ---------------------------------------------------------------------------

/**
 * Returns server-configured LLM providers. Exposes only the allowed model list
 * and the "managed" flag (presence in this map) — never the API key or the
 * base URL, which can reveal internal gateway/proxy infrastructure.
 */
export function getServerProviders(): Record<string, { models?: string[] }> {
  const cfg = getConfig();
  const result: Record<string, { models?: string[] }> = {};
  for (const [id, entry] of Object.entries(cfg.providers)) {
    result[id] = {};
    if (entry.models && entry.models.length > 0) result[id].models = entry.models;
  }
  return result;
}

/** Resolve API key. Managed provider ⇒ server key; otherwise client key. */
export function resolveApiKey(providerId: string, clientKey?: string): string {
  registerLogSecret(clientKey, 'visitor');
  return resolveSectionApiKey('providers', providerId, clientKey);
}

/** Resolve base URL. Managed provider ⇒ server URL; otherwise client URL. */
export function resolveBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  return resolveSectionBaseUrl('providers', providerId, clientBaseUrl);
}

/** Resolve proxy URL for a provider (server config only) */
export function resolveProxy(providerId: string): string | undefined {
  return serverEntry('providers', providerId)?.proxy;
}

// ---------------------------------------------------------------------------
// Public API — TTS
// ---------------------------------------------------------------------------

/**
 * Returns TTS providers the client must know about: server-managed providers
 * (presence = managed flag, no base URLs) plus operator force-disabled
 * providers (`{ disabled: true }`). A force-disabled provider is reported as
 * disabled even when it is otherwise configured — disable wins (#665).
 */
export function getServerTTSProviders(): Record<string, { disabled?: boolean }> {
  const cfg = getConfig();
  const result: Record<string, { disabled?: boolean }> = {};
  for (const id of Object.keys(cfg.tts)) result[id] = {};
  for (const id of cfg.disabled.tts) result[id] = { disabled: true };
  return result;
}

/**
 * TTS providers this deployment actually serves: present in server config and
 * not force-disabled. Browser-native voices are excluded (no static voice list
 * and no server-side synthesis without a configured backend).
 */
export function enabledServerTTSProviderIds(): string[] {
  return Object.entries(getServerTTSProviders())
    .filter(([id, info]) => id !== 'browser-native-tts' && !info.disabled)
    .map(([id]) => id);
}

export function resolveTTSApiKey(providerId: string, clientKey?: string): string {
  registerLogSecret(clientKey, 'visitor');
  return resolveSectionApiKey('tts', providerId, clientKey);
}

/** Whether the operator force-disabled this TTS provider (server precedence, #665). */
export function isServerTTSProviderDisabled(providerId: string): boolean {
  return isServerProviderDisabled('tts', providerId);
}

export function resolveTTSBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  return (
    resolveSectionBaseUrl('tts', providerId, clientBaseUrl) ||
    TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS]?.defaultBaseUrl
  );
}

/** Resolve the server-only Qwen VC model override without exposing env values to clients. */
export function resolveQwenVoiceCloneModel(): string {
  return process.env.TTS_QWEN_VOICE_CLONE_MODEL || DEFAULT_QWEN_TTS_VOICE_CLONE_MODEL;
}

export class TTSModelNotAllowedError extends Error {
  readonly code = 'INVALID_REQUEST';
  readonly httpStatus = 400;

  constructor(providerId: string, modelId: string) {
    super(`Model "${modelId}" is not allowed for provider "${providerId}"`);
    this.name = 'TTSModelNotAllowedError';
  }
}

/**
 * Resolve the TTS model. A managed provider may pin its model server-side
 * (`${PREFIX}_MODELS`, first entry) — authoritative like its key/baseUrl, since
 * the managed-provider UI does not expose a model field. Otherwise the client
 * model wins.
 */
export function resolveTTSModel(
  providerId: string,
  clientModel?: string,
  voiceId?: string,
): string | undefined {
  const entry = serverEntry('tts', providerId);
  const pinnedModels = entry?.models?.filter(Boolean) ?? [];

  if (providerId === 'qwen-tts') {
    const vcModel = resolveQwenVoiceCloneModel();
    const requestedIsVCSentinel = !!clientModel && isQwenVoiceCloneModel(clientModel, vcModel);
    const normalizedClientModel = requestedIsVCSentinel ? vcModel : clientModel;
    const allowedModels = new Set([...pinnedModels, vcModel]);

    if (
      pinnedModels.length > 0 &&
      normalizedClientModel &&
      !allowedModels.has(normalizedClientModel)
    ) {
      throw new TTSModelNotAllowedError(providerId, normalizedClientModel);
    }

    if (voiceId) {
      if (!isQwenCatalogVoice(voiceId)) return vcModel;
      const pinnedCatalogModel = pinnedModels.find((model) => model !== vcModel);
      if (pinnedModels.length > 0 && !pinnedCatalogModel) {
        throw new TTSModelNotAllowedError(providerId, TTS_PROVIDERS['qwen-tts'].defaultModelId);
      }
      // Self-heal persisted VC-model + catalog-voice wedges. Prefer the first
      // operator-pinned non-VC model, otherwise the catalog default.
      if (normalizedClientModel === vcModel) {
        return pinnedCatalogModel || TTS_PROVIDERS['qwen-tts'].defaultModelId;
      }
    }

    if (normalizedClientModel) return normalizedClientModel;
    if (pinnedModels.length > 0) return pinnedModels[0];
    return undefined;
  }

  if (pinnedModels.length > 0) return pinnedModels[0];
  return clientModel;
}

// ---------------------------------------------------------------------------
// Public API — ASR
// ---------------------------------------------------------------------------

/**
 * Returns ASR providers the client must know about: server-managed providers
 * (presence = managed flag) plus operator force-disabled providers
 * (`{ disabled: true }`), mirroring the TTS listing — disable wins (#665).
 */
export function getServerASRProviders(): Record<string, { disabled?: boolean }> {
  const cfg = getConfig();
  const result: Record<string, { disabled?: boolean }> = {};
  for (const id of Object.keys(cfg.asr)) result[id] = {};
  for (const id of cfg.disabled.asr) result[id] = { disabled: true };
  return result;
}

export function resolveASRApiKey(providerId: string, clientKey?: string): string {
  registerLogSecret(clientKey, 'visitor');
  return resolveSectionApiKey('asr', providerId, clientKey);
}

export function resolveASRBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  return resolveSectionBaseUrl('asr', providerId, clientBaseUrl);
}

/** First operator-configured ASR provider that is not force-disabled. */
export function resolveServerASRProviderId(): string | undefined {
  const cfg = getConfig();
  return Object.keys(cfg.asr).find((id) => !cfg.disabled.asr.has(id));
}

/**
 * Resolve the ASR model. When the operator pinned models server-side
 * (`ASR_<PREFIX>_MODELS`), the allowlisted client choice wins and the first
 * entry is the managed default; otherwise the client model wins.
 */
export function resolveASRModel(providerId: string, clientModel?: string): string | undefined {
  const serverModels = serverEntry('asr', providerId)?.models;
  if (serverModels?.length) {
    if (clientModel && serverModels.includes(clientModel)) return clientModel;
    return serverModels[0];
  }
  return clientModel;
}

// ---------------------------------------------------------------------------
// Public API — PDF
// ---------------------------------------------------------------------------

/** Returns server-configured PDF providers (managed flag only, no base URLs). */
export function getServerPDFProviders(): Record<string, Record<string, never>> {
  return Object.fromEntries(Object.keys(getConfig().pdf).map((id) => [id, {}]));
}

export function resolvePDFApiKey(providerId: string, clientKey?: string): string {
  registerLogSecret(clientKey, 'visitor');
  return resolveSectionApiKey('pdf', providerId, clientKey);
}

export function resolvePDFBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  return resolveSectionBaseUrl('pdf', providerId, clientBaseUrl);
}

// ---------------------------------------------------------------------------
// Public API — Image Generation
// ---------------------------------------------------------------------------

/**
 * Returns image providers the client must know about: server-managed providers
 * (allowed models only, no base URLs) plus operator force-disabled providers
 * (`{ disabled: true }`), mirroring the TTS listing — disable wins (#665).
 */
export function getServerImageProviders(): Record<
  string,
  { models?: string[]; disabled?: boolean }
> {
  const cfg = getConfig();
  const result: Record<string, { models?: string[]; disabled?: boolean }> = {};
  for (const [id, entry] of Object.entries(cfg.image)) {
    result[id] = {};
    if (entry.models && entry.models.length > 0) result[id].models = entry.models;
  }
  for (const id of cfg.disabled.image) result[id] = { disabled: true };
  return result;
}

export function resolveImageApiKey(providerId: string, clientKey?: string): string {
  registerLogSecret(clientKey, 'visitor');
  return resolveSectionApiKey('image', providerId, clientKey);
}

export function resolveImageBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): string | undefined {
  return resolveSectionBaseUrl('image', providerId, clientBaseUrl);
}

/**
 * Resolve the server-side default image provider, used when the client sends
 * no provider preference: the first operator-configured image provider that is
 * not force-disabled. Returns undefined when no image provider is enabled at
 * all (callers fail loud).
 */
export function resolveServerImageProviderId(): string | undefined {
  const disabled = getConfig().disabled.image;
  return Object.keys(getConfig().image).find((id) => !disabled.has(id));
}

/**
 * Resolve the image model. When the operator pinned models server-side
 * (`IMAGE_<PREFIX>_MODELS`), the allowlisted client choice wins and the first
 * entry is the managed default; otherwise the client model wins.
 */
export function resolveImageModel(providerId: string, clientModel?: string): string | undefined {
  const serverModels = serverEntry('image', providerId)?.models;
  if (serverModels?.length) {
    if (clientModel && serverModels.includes(clientModel)) return clientModel;
    return serverModels[0];
  }
  return clientModel;
}

// ---------------------------------------------------------------------------
// Public API — Video Generation
// ---------------------------------------------------------------------------

/**
 * Returns video providers the client must know about: server-managed providers
 * (presence = managed flag) plus operator force-disabled providers
 * (`{ disabled: true }`), mirroring the TTS listing — disable wins (#665).
 */
export function getServerVideoProviders(): Record<
  string,
  { models?: string[]; disabled?: boolean }
> {
  const cfg = getConfig();
  const result: Record<string, { models?: string[]; disabled?: boolean }> = {};
  for (const [id, entry] of Object.entries(cfg.video)) {
    result[id] = {};
    if (entry.models && entry.models.length > 0) result[id].models = entry.models;
  }
  for (const id of cfg.disabled.video) result[id] = { disabled: true };
  return result;
}

export function resolveVideoApiKey(providerId: string, clientKey?: string): string {
  registerLogSecret(clientKey, 'visitor');
  return resolveSectionApiKey('video', providerId, clientKey);
}

export function resolveVideoBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): string | undefined {
  return resolveSectionBaseUrl('video', providerId, clientBaseUrl);
}

/**
 * Resolve the server-side default video provider, used when the client sends
 * no provider preference: the first operator-configured video provider that is
 * not force-disabled. Returns undefined when no video provider is enabled at
 * all (callers fail loud).
 */
export function resolveServerVideoProviderId(): string | undefined {
  const disabled = getConfig().disabled.video;
  return Object.keys(getConfig().video).find((id) => !disabled.has(id));
}

/**
 * Resolve the video model. When the operator pinned models server-side
 * (`VIDEO_<PREFIX>_MODELS`), the allowlisted client choice wins and the first
 * entry is the managed default; otherwise the client model wins.
 */
export function resolveVideoModel(providerId: string, clientModel?: string): string | undefined {
  const serverModels = serverEntry('video', providerId)?.models;
  if (serverModels?.length) {
    if (clientModel && serverModels.includes(clientModel)) return clientModel;
    return serverModels[0];
  }
  return clientModel;
}

// ---------------------------------------------------------------------------
// Public API — Web Search
// ---------------------------------------------------------------------------

/**
 * Returns web-search providers the client must know about: server-managed
 * providers (presence = managed flag) plus operator force-disabled providers
 * (`{ disabled: true }`), mirroring the TTS listing — disable wins (#665).
 */
export function getServerWebSearchProviders(): Record<string, { disabled?: boolean }> {
  const cfg = getConfig();
  const result: Record<string, { disabled?: boolean }> = {};
  for (const id of Object.keys(cfg.webSearch)) result[id] = {};
  for (const id of cfg.disabled.webSearch) result[id] = { disabled: true };
  return result;
}

/**
 * Resolve web search API key.
 *
 * Backward-compatible call shapes:
 * - resolveWebSearchApiKey(clientKey) -> Tavily key resolution
 * - resolveWebSearchApiKey(providerId, clientKey) -> provider-specific resolution
 */
export function resolveWebSearchApiKey(clientKey?: string): string;
export function resolveWebSearchApiKey(providerId: string, clientKey?: string): string;
export function resolveWebSearchApiKey(providerIdOrClientKey?: string, clientKey?: string): string {
  const hasProviderId = arguments.length >= 2;
  const providerId = hasProviderId ? providerIdOrClientKey || 'tavily' : 'tavily';
  const effectiveClientKey = hasProviderId ? clientKey : providerIdOrClientKey;
  return resolveSectionApiKey('webSearch', providerId, effectiveClientKey);
}

export function resolveWebSearchBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): string | undefined {
  return resolveSectionBaseUrl('webSearch', providerId, clientBaseUrl);
}

/**
 * Resolve the web-search model for model-based providers (currently Claude).
 * A managed provider may pin its model server-side (`${PREFIX}_MODELS`, first
 * entry) — authoritative like its key/baseUrl. Otherwise the client model wins.
 */
export function resolveWebSearchModel(
  providerId: string,
  clientModel?: string,
): string | undefined {
  const entry = serverEntry('webSearch', providerId);
  if (entry?.models && entry.models.length > 0) return entry.models[0];
  return clientModel;
}

export function resolveServerWebSearchProviderId(preferredProviderId?: string): string | undefined {
  const webSearch = getConfig().webSearch;
  const disabled = getConfig().disabled.webSearch;
  const enabled = (id: string) => !disabled.has(id);
  if (
    preferredProviderId &&
    enabled(preferredProviderId) &&
    webSearch[preferredProviderId]?.apiKey
  ) {
    return preferredProviderId;
  }
  if (enabled('tavily') && webSearch.tavily?.apiKey) return 'tavily';
  if (enabled('exa') && webSearch.exa?.apiKey) return 'exa';
  if (enabled('bocha') && webSearch.bocha?.apiKey) return 'bocha';
  if (enabled('baidu') && webSearch.baidu?.apiKey) return 'baidu';
  if (enabled('minimax') && webSearch.minimax?.apiKey) return 'minimax';
  if (enabled('claude') && webSearch.claude?.apiKey) return 'claude';
  return Object.keys(webSearch).find(enabled);
}

/**
 * Opt-in concurrency for parallel scene-content generation (#572).
 *
 * Returns the server-configured `PARALLEL_SCENE_CONCURRENCY`, clamped to
 * [0, 10]. `0` (the default) means the client keeps the original serial
 * generation loop; a value `> 1` enables the hybrid two-phase path. Kept
 * server-side because many deployments use API keys with low per-key
 * concurrency quotas, where a bursty default would surface as 429s.
 */
export function getParallelSceneConcurrency(): number {
  const raw = Number.parseInt(process.env.PARALLEL_SCENE_CONCURRENCY ?? '', 10);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(raw, 10);
}
