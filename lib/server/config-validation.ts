/**
 * Boot-time validation of model routing configuration (warn-first).
 *
 * Runs once at startup (see instrumentation.ts). Misconfiguration is otherwise
 * discovered only at request time — or worse, per-session. At boot we surface,
 * as `[config]` warnings:
 *
 *  - a route key that is not a routable stage (typo detection);
 *  - a route / the default model whose provider prefix is not registered, or
 *    whose provider requires an API key that is not configured (keyless
 *    providers like Ollama pass);
 *  - a bare model id (no `provider:` prefix) — it still defaults to `openai`
 *    for backward compatibility, but that fallback is deprecated;
 *  - the master key for stored provider secrets (`PROVIDER_SECRET_KEY`) missing or
 *    malformed, and stored secrets that this server cannot decrypt;
 *  - environment variables and files that used to configure providers and are
 *    now ignored (`*_API_KEY`, `DEFAULT_MODEL`, `MODEL_ROUTES`, `server-providers.yml`);
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
import fs from 'node:fs';
import path from 'node:path';

import { getServerProviders, resolveApiKey } from '@/lib/server/provider-config';
import { loadKeyRing, ProviderKeyError } from '@/lib/server/provider-store/crypto';
import { currentSnapshot, isProviderSnapshotLoaded } from '@/lib/server/provider-store/snapshot';
import type { ProviderId } from '@/lib/types/provider';

/** Consistent prefix for boot-time config warnings. */
const WARN_PREFIX = '[config]';

function warn(message: string): void {
  console.warn(`${WARN_PREFIX} ${message}`);
}

/** Extract the model string from a stored route value (string or `{model}`). */
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
 * `routed` distinguishes stage routes — where the server key is the
 * only key that can be used — from unrouted sites like the default model, where a
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
        `Provider "${providerId}" in ${where} has no API key configured — add it in Settings (top bar), or requests using it will fail.`,
      );
    } else {
      warn(
        `Provider "${providerId}" in ${where} has no server API key configured — requests will only work when the client supplies its own key.`,
      );
    }
  }
}

function validateModelRoutes(): void {
  for (const [key, value] of Object.entries(currentSnapshot().routing.routes)) {
    if (!(LLM_STAGES as readonly string[]).includes(key)) {
      warn(
        `Unknown stage "${key}" in the model routes — not a routable stage (typo?). Valid stages: ${LLM_STAGES.join(', ')}`,
      );
      continue;
    }
    const model = routeModel(value);
    if (!model) continue; // no model string; model-routes warns about bad values at request time
    checkModelString(model, `model route for stage "${key}"`, true);
  }
}

function validateDefaultModel(): void {
  const model = currentSnapshot().routing.defaultModel;
  if (!model) return;
  checkModelString(model, 'the default model', false);
}

/** Names of environment variables that no longer configure anything, so a leftover is not a silent no-op. */
const IGNORED_ENV_NAME = /(_API_KEY|^DEFAULT_MODEL|^MODEL_ROUTES)$/;

/**
 * Provider keys, base URLs, pinned models and the default model are stored in the database and set
 * in the Settings popup. Environment values and `server-providers.yml` are not read, so say so once
 * at boot when they are still there: the operator who left them believes they take effect.
 */
function validateLegacyProviderConfig(): void {
  const names = Object.keys(process.env).filter(
    (name) => IGNORED_ENV_NAME.test(name) && process.env[name]?.trim(),
  );
  if (names.length > 0) {
    warn(
      `These environment variables are ignored: ${names.sort().join(', ')}. AI provider keys, models and the default model are set by an administrator in Settings (top bar): enter them there, then remove these variables.`,
    );
  }
  if (fs.existsSync(path.join(process.cwd(), 'server-providers.yml'))) {
    warn(
      'server-providers.yml is ignored. AI provider settings are stored in the database: an administrator enters them in Settings (top bar), then delete the file.',
    );
  }
}

/**
 * Stored provider secrets are encrypted with PROVIDER_SECRET_KEY. Without it (or with a key that
 * does not match what was stored) the providers cannot be served, so name the problem at boot.
 */
function validateProviderStore(): void {
  if (!process.env.DATABASE_URL?.trim()) return;
  try {
    if (!loadKeyRing()) {
      warn(
        'PROVIDER_SECRET_KEY is not set: stored provider secrets cannot be read or saved. Generate one with `openssl rand -base64 32`.',
      );
    }
  } catch (err) {
    warn(err instanceof ProviderKeyError ? err.message : 'PROVIDER_SECRET_KEY is not valid.');
  }
  if (!isProviderSnapshotLoaded()) return;
  const { unreadable } = currentSnapshot();
  if (unreadable.length > 0) {
    warn(
      `${unreadable.length} stored provider secret(s) cannot be decrypted with PROVIDER_SECRET_KEY: ${unreadable.map((row) => `${row.section}/${row.providerId}`).join(', ')}.`,
    );
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
  const managed = Object.keys(getServerProviders()).filter((providerId) => {
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
    validateLegacyProviderConfig();
    validateProviderStore();
    // The routes and the managed keys are read from the loaded settings. When a configured
    // database could not be read at boot, the loader says so and keeps retrying.
    if (isProviderSnapshotLoaded() || !process.env.DATABASE_URL?.trim()) {
      validateModelRoutes();
      validateDefaultModel();
    }
    validateAgentRuntime();
    validateAccessGate();
    if (isProviderSnapshotLoaded() || !process.env.DATABASE_URL?.trim()) validateManagedKeys();
    validatePublicOrigin();
  } catch (err) {
    // Boot-time validation must never take the server down.
    const detail = err instanceof Error ? err.message : String(err);
    warn(`Unexpected error during config validation: ${detail}`);
  }
}
