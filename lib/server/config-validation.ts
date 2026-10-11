/**
 * Boot-time validation of model routing configuration (warn-first).
 *
 * Runs once at startup (see instrumentation.ts). Misconfiguration is otherwise
 * discovered only at request time — or worse, per-session. At boot we surface,
 * as `[config]` warnings:
 *
 *  - a `DEFAULT_MODEL` whose provider prefix is not registered, or
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
 * still get a running app, and the warnings name exactly what is broken. The one
 * exception is the student-mode preflight (`validateStudentModeConfiguration`): a
 * student deployment is refused at boot, so that check throws.
 */

import { getProvider, warnBareModelIdDeprecation } from '@/lib/ai/providers';
import {
  isAgentRuntimeEnabled,
  isLearnHome,
  isLearnHomeBuild,
  isReviewRequired,
  isTutorModerationEnabled,
} from '@/lib/config/feature-flags';
import { ACCESS_CODE_MIN_RECOMMENDED_LENGTH } from '@/lib/server/access-code-warning';
import { ACCESS_SECRET_MIN_LENGTH } from '@/lib/server/access-token-edge';
import { deploymentConfig, userKeysAllowed } from '@/lib/server/model-config/runtime';
import {
  isServerConfiguredProvider,
  LLM_ENV_MAP,
  resolveApiKey,
} from '@/lib/server/provider-config';
import { getTutorRoute } from '@/lib/tutor/llm-roles';
import type { ProviderId } from '@/lib/types/provider';

/** Consistent prefix for boot-time config warnings. */
const WARN_PREFIX = '[config]';

function warn(message: string): void {
  console.warn(`${WARN_PREFIX} ${message}`);
}

/**
 * Check one model string the way parseModelString would resolve it: a bare id
 * gets the shared deprecation warning; a prefixed id is checked for a
 * registered provider and (for key-requiring providers) a configured key.
 * `routed` marks a site where the server key is the only key that can be
 * used, as opposed to DEFAULT_MODEL, where a client-supplied key still works
 * and a missing server key is only a note.
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

/**
 * Warnings for student-mode settings that boot accepts but that change what learners see.
 */
function validateStudentModeWarnings(): void {
  if (isLearnHome() && !isReviewRequired()) {
    warn(
      'OPENMAIC_REQUIRE_REVIEW is false on a student deployment (OPENMAIC_HOME=learn): lessons without a passing review are shown to students. Leave it unset to show only reviewed lessons.',
    );
  }
  if (!isLearnHome() && isLearnHomeBuild()) {
    warn(
      'NEXT_PUBLIC_OPENMAIC_HOME=learn was set at build time but OPENMAIC_HOME is not learn: the Settings button is hidden for every user of this build.',
    );
  }
}

/**
 * The preflight of a student deployment (`OPENMAIC_HOME=learn`). It lists every problem at once,
 * each naming the setting or file to change, and throws so that boot stops (instrumentation.ts runs
 * it among the fatal checks). It does nothing otherwise.
 */
export function validateStudentModeConfiguration(): void {
  if (!isLearnHome()) return;

  const problems: string[] = [];
  const accessCode = process.env.ACCESS_CODE ?? '';
  if ([...accessCode].length < ACCESS_CODE_MIN_RECOMMENDED_LENGTH) {
    problems.push(
      `ACCESS_CODE must be set to at least ${ACCESS_CODE_MIN_RECOMMENDED_LENGTH} characters.`,
    );
  }
  const secret = process.env.OPENMAIC_ACCESS_SECRET ?? '';
  if ([...secret].length < ACCESS_SECRET_MIN_LENGTH) {
    problems.push(
      `OPENMAIC_ACCESS_SECRET must be set to at least ${ACCESS_SECRET_MIN_LENGTH} characters (a shorter value is ignored).`,
    );
  } else if (secret === accessCode) {
    problems.push('OPENMAIC_ACCESS_SECRET must differ from ACCESS_CODE.');
  }
  if (!isTutorModerationEnabled()) {
    problems.push(
      'OPENMAIC_TUTOR_MODERATION must be true: chat moderation is mandatory on student deployments.',
    );
  }
  if (!getTutorRoute('tutor-moderation')) {
    problems.push(
      'tutor.moderation has no model: assign one under slots in openmaic.yml (tutor.moderation, or a parent slot that covers it).',
    );
  }
  const layer = deploymentConfig().layer;
  if (userKeysAllowed(layer)) {
    problems.push(
      'allowUserKeys must be false in openmaic.yml: students may not add providers or keys.',
    );
  }
  if (layer?.config.lock !== 'all') {
    problems.push(
      'lock: all must be set in openmaic.yml: no one may change a model or provider on a student deployment.',
    );
  }
  if (!isLearnHomeBuild()) {
    problems.push(
      'NEXT_PUBLIC_OPENMAIC_HOME=learn must be set at build time, or the Settings button stays visible to students.',
    );
  }
  // A fixed owner puts every learner in one library, whatever the access code.
  if (['true', '1'].includes(process.env.OWNER_SINGLE_USER?.trim().toLowerCase() ?? '')) {
    problems.push(
      'OWNER_SINGLE_USER must be unset: every learner would share one owner and library.',
    );
  }
  if (process.env.PERSISTENCE_SHARED_OWNER_ID?.trim()) {
    problems.push(
      'PERSISTENCE_SHARED_OWNER_ID must be unset: every learner would share one owner and library.',
    );
  }
  if (problems.length > 0) {
    throw new Error(`OPENMAIC_HOME=learn refuses to start:\n- ${problems.join('\n- ')}`);
  }
}

/**
 * Validate server model-routing config at boot. Warn-only, cheap, and
 * non-throwing: a broken config never prevents the server from starting.
 */
export function validateServerConfig(): void {
  try {
    validateDefaultModel();
    validateModelsEnvPins();
    validateAgentRuntime();
    validateStudentModeWarnings();
  } catch (err) {
    // Boot-time validation must never take the server down.
    const detail = err instanceof Error ? err.message : String(err);
    warn(`Unexpected error during config validation: ${detail}`);
  }
}
