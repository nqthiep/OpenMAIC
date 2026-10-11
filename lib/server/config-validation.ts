/**
 * Boot-time validation of model routing configuration (warn-first).
 *
 * Runs once at startup (see instrumentation.ts). Misconfiguration is otherwise
 * discovered only at request time — or worse, per-session. At boot we surface,
 * as `[config]` warnings:
 *
 *  - `MODEL_ROUTES` that does not parse as JSON;
 *  - a route key that is not a routable stage (typo detection);
 *  - a route / `DEFAULT_MODEL` whose provider prefix is not registered, or
 *    whose provider requires an API key that is not configured (keyless
 *    providers like Ollama pass);
 *  - a bare model id (no `provider:` prefix) — it still defaults to `openai`
 *    for backward compatibility, but that fallback is deprecated;
 *  - a `<PREFIX>_MODELS` env set for a provider whose key env is absent
 *    (pinned models on an unconfigured provider — probably a typo);
 *  - the agent runtime flag set without a `DATABASE_URL` — the runtime is
 *    enabled but unusable, so its probe reports disabled and its routes
 *    answer 404 while the runner never starts.
 *
 * Everything here is a warning, never a throw: operators with partial config
 * still get a running app, and the warnings name exactly what is broken.
 */

import { getProvider, warnBareModelIdDeprecation } from '@/lib/ai/providers';
import { isAgentRuntimeEnabled } from '@/lib/config/feature-flags';
import { LLM_STAGES } from '@/lib/server/model-routes';
import { parsePublicAppOrigin } from '@/lib/server/public-origin';
import {
  isServerConfiguredProvider,
  LLM_ENV_MAP,
  resolveApiKey,
} from '@/lib/server/provider-config';
import type { ProviderId } from '@/lib/types/provider';

/** Consistent prefix for boot-time config warnings. */
const WARN_PREFIX = '[config]';

function warn(message: string): void {
  console.warn(`${WARN_PREFIX} ${message}`);
}

/** Extract the model string from a MODEL_ROUTES route value (string or `{model}`). */
function routeModel(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const model = (value as Record<string, unknown>).model;
    if (typeof model === 'string') {
      const trimmed = model.trim();
      return trimmed || undefined;
    }
  }
  return undefined;
}

/**
 * Check one model string the way parseModelString would resolve it: a bare id
 * gets the shared deprecation warning; a prefixed id is checked for a
 * registered provider and (for key-requiring providers) a configured key.
 * `routed` distinguishes MODEL_ROUTES entries — where the server key is the
 * only key that can be used — from unrouted sites like DEFAULT_MODEL, where a
 * client-supplied key still works and a missing server key is only a note.
 */
function checkModelString(model: string, where: string, routed: boolean): void {
  const colonIndex = model.indexOf(':');
  if (colonIndex <= 0) {
    warnBareModelIdDeprecation(model, where);
    return;
  }
  const providerId = model.slice(0, colonIndex);
  const provider = getProvider(providerId as ProviderId);
  if (!provider) {
    warn(`Unknown provider "${providerId}" in ${where} — not a registered provider (typo?).`);
    return;
  }
  if (provider.requiresApiKey && !resolveApiKey(providerId)) {
    if (routed) {
      warn(
        `Provider "${providerId}" in ${where} has no API key configured — add a <PREFIX>_API_KEY env var (or server-providers.yml), or requests using it will fail.`,
      );
    } else {
      warn(
        `Provider "${providerId}" in ${where} has no server API key configured — requests will only work when the client supplies its own key.`,
      );
    }
  }
}

function validateModelRoutes(): void {
  const raw = process.env.MODEL_ROUTES?.trim();
  if (!raw) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warn('MODEL_ROUTES is not valid JSON — check the value (configured routes are ignored).');
    return;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warn('MODEL_ROUTES must be a JSON object mapping stage -> model; ignoring it.');
    return;
  }

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!(LLM_STAGES as readonly string[]).includes(key)) {
      warn(
        `Unknown stage "${key}" in MODEL_ROUTES — not a routable stage (typo?). Valid stages: ${LLM_STAGES.join(', ')}`,
      );
      continue;
    }
    const model = routeModel(value);
    if (!model) continue; // no model string; model-routes warns about bad values at request time
    checkModelString(model, `MODEL_ROUTES stage "${key}"`, true);
  }
}

function validateDefaultModel(): void {
  const model = process.env.DEFAULT_MODEL?.trim();
  if (!model) return;
  checkModelString(model, 'DEFAULT_MODEL', false);
}

/**
 * A `<PREFIX>_MODELS` pin only takes effect when the provider is actually
 * configured (its key env, or a base URL for keyless providers). A pin on an
 * unconfigured provider is dead config — usually a typo.
 */
function validateModelsEnvPins(): void {
  for (const [prefix, providerId] of Object.entries(LLM_ENV_MAP)) {
    if (!process.env[`${prefix}_MODELS`]) continue;
    const provider = getProvider(providerId as ProviderId);
    if (!provider) {
      warn(
        `${prefix}_MODELS is set for provider "${providerId}" — not a registered provider (typo?).`,
      );
      continue;
    }
    const configured = provider.requiresApiKey
      ? !!resolveApiKey(providerId)
      : isServerConfiguredProvider('providers', providerId) || !!provider.defaultBaseUrl;
    if (!configured) {
      const missing = provider.requiresApiKey ? `${prefix}_API_KEY` : `${prefix}_BASE_URL`;
      warn(
        `${prefix}_MODELS is set for provider "${providerId}" but ${missing} is not — pinned models on an unconfigured provider (probably a typo).`,
      );
    }
  }
}

/**
 * The agent runtime needs the flag AND a database: the runner and every
 * persistence-touching route depend on the store. A flag without
 * `DATABASE_URL` is the classic "nothing happens" misconfiguration — the
 * probe reports the runtime unusable, its routes answer 404, and no runner
 * starts. One boot-time warning saves the whole debugging session.
 */
function validateAgentRuntime(): void {
  if (!isAgentRuntimeEnabled()) return;
  if (!process.env.DATABASE_URL?.trim()) {
    warn(
      'OPENMAIC_AGENT_RUNTIME_ENABLED is set but DATABASE_URL is not — the agent runtime is enabled but unusable: its probe reports disabled, its routes answer 404, and no runner starts. Set DATABASE_URL or disable the flag.',
    );
  }
}

/** Shortest access code that passes the boot check without a warning. */
const MIN_ACCESS_CODE_LENGTH = 12;

/**
 * The access cookie is signed with the access code unless ACCESS_COOKIE_SECRET is
 * set. A visitor holding one valid cookie can then test codes offline, so a short
 * code protects little. Warnings only, so existing deployments keep booting.
 */
function validateAccessGate(): void {
  const code = process.env.ACCESS_CODE?.trim();
  if (!code) return;
  if (!process.env.ACCESS_COOKIE_SECRET?.trim()) {
    warn(
      'ACCESS_CODE is set but ACCESS_COOKIE_SECRET is not: the access cookie is signed with the code, so a visitor holding one cookie can test codes offline. Set ACCESS_COOKIE_SECRET to at least 32 characters.',
    );
  }
  if (code.length < MIN_ACCESS_CODE_LENGTH) {
    warn(
      `ACCESS_CODE is ${code.length} characters. Use at least ${MIN_ACCESS_CODE_LENGTH}: a short code is the only protection when the cookie can be tested offline.`,
    );
  }
}

/**
 * Server LLM keys are spent by whoever can reach this server. Nothing stops that
 * without an access code, so say so at boot.
 */
function validateManagedKeys(): void {
  if (process.env.ACCESS_CODE?.trim()) return;
  const managed = [...new Set(Object.values(LLM_ENV_MAP))].filter((providerId) => {
    const provider = getProvider(providerId as ProviderId);
    return !!provider?.requiresApiKey && !!resolveApiKey(providerId);
  });
  if (managed.length === 0) return;
  warn(
    `Server API keys are set for ${managed.join(', ')}, and ACCESS_CODE is not set: anyone who can reach this server can spend them. Set ACCESS_CODE, or remove the server keys if each user brings a key.`,
  );
}

/**
 * Classroom creation needs hard links in the data directory. Without them each
 * create fails with a 500, so check at boot instead of waiting for a teacher to
 * find out. Asynchronous and fire-and-forget: it never blocks startup.
 */
export async function checkClassroomStorage(): Promise<void> {
  try {
    const { CLASSROOMS_DIR, probeHardLinkSupport } = await import('@/lib/server/classroom-storage');
    if (await probeHardLinkSupport()) return;
    warn(
      `Hard links are not supported in ${CLASSROOMS_DIR}. Classroom creation will fail until the data directory is on a filesystem that supports them.`,
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code ?? 'unknown';
    warn(`Could not check classroom storage (${code}). Classroom creation may fail.`);
  }
}

/**
 * PUBLIC_APP_ORIGIN sets the origin in generated links. An invalid value is never
 * trusted; the server's own origin is used instead. Unset in production, the
 * proxy's forwarded host decides the origin, which is worth saying at boot.
 */
function validatePublicOrigin(): void {
  const raw = process.env.PUBLIC_APP_ORIGIN?.trim();
  if (raw) {
    if (!parsePublicAppOrigin(raw)) {
      warn(
        "PUBLIC_APP_ORIGIN must be an origin such as https://classroom.example.edu, with no path, query or credentials. Until it is fixed, generated links use this server's own address.",
      );
    }
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    warn(
      "PUBLIC_APP_ORIGIN is not set. Generated links then trust the x-forwarded-host header from the proxy; set it to this server's public origin.",
    );
  }
}

/**
 * Validate server model-routing config at boot. Warn-only, cheap, and
 * non-throwing: a broken config never prevents the server from starting.
 */
export function validateServerConfig(): void {
  try {
    validateModelRoutes();
    validateDefaultModel();
    validateModelsEnvPins();
    validateAgentRuntime();
    validateAccessGate();
    validateManagedKeys();
    validatePublicOrigin();
  } catch (err) {
    // Boot-time validation must never take the server down.
    const detail = err instanceof Error ? err.message : String(err);
    warn(`Unexpected error during config validation: ${detail}`);
  }
}
