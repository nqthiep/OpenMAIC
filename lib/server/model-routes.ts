/**
 * Per-stage LLM model routing (issue #745).
 *
 * Optional, config-only overrides that map a generation *stage* to a specific
 * model string. This module returns only configured routes; callers choose their
 * own fallback when a route is unset or invalid. Most use the default model
 * (`getDefaultModel`), while `conversation-title` reuses the agent-driver connection.
 *
 * Surface: the `model_routing` table, edited in the Settings popup (top bar) (it replaces the
 * `MODEL_ROUTES` and `DEFAULT_MODEL` environment variables). Each stage's value is a
 * model string in the canonical `provider:model` format (see parseModelString), OR an
 * object `{model, thinking}` where `thinking` is the full ThinkingConfig abstraction
 * (mode/effort/level/enabled/budgetTokens/excludeReasoningOutput) — normalized
 * per the model's capability by callLLM. e.g.
 *
 *   default:        openai:gpt-5.4-mini
 *   scene-content:  openai:gpt-5.4
 *   pbl-chat:       {"model":"anthropic:claude-sonnet-4","thinking":{"enabled":false}}
 *   pbl-v2-runtime: deepseek:deepseek-v4-pro
 *
 * Only the *routable* stages below are valid keys — each is backed by a real
 * `resolveModel` call site. Downstream sub-calls (e.g. `pbl-generate`,
 * `chat-adapter-stream`) inherit their parent stage's resolved model.
 */

import { createLogger } from '@/lib/logger';
import { currentSnapshot } from '@/lib/server/provider-store/snapshot';
import type {
  ThinkingConfig,
  ThinkingEffort,
  ThinkingLevel,
  ThinkingMode,
} from '@/lib/types/provider';

const log = createLogger('model-routes');

const VALID_MODES: readonly ThinkingMode[] = ['default', 'disabled', 'enabled', 'auto'];
const VALID_EFFORTS: readonly ThinkingEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];
const VALID_LEVELS: readonly ThinkingLevel[] = ['minimal', 'low', 'medium', 'high'];

/**
 * A resolved route entry: the model string plus an optional full thinking config.
 *
 * `api`/`dialect` and `contextWindow` are parsed for every routable stage but are
 * currently consumed only by the agent-driver stage (`maic-agent-driver`); on any
 * other stage they are inert (accepted silently, never applied). `thinking` is the
 * only field honored by the generic callLLM stages.
 */
export interface StageRoute {
  model: string;
  /**
   * Explicit pi transport dialect (for example openai-completions). Consumed only
   * by the agent-driver stage; inert on every other routable stage.
   */
  api?: string;
  /**
   * Effective context window for this stage, overriding the provider catalog
   * value. Consumed by pi-native compaction thresholds (e.g. the agent driver)
   * so an operator can pin a conservative window below the catalog number.
   * Consumed only by the agent-driver stage; inert on every other routable stage.
   */
  contextWindow?: number;
  /**
   * Full thinking config for this stage (the unified ThinkingConfig abstraction:
   * mode / effort / level / enabled / budgetTokens / excludeReasoningOutput).
   * Passed through to callLLM, which normalizes it against the model's capability.
   */
  thinking?: ThinkingConfig;
}

/** Validate/sanitize a route's `thinking` object into a ThinkingConfig (drops bad fields with a warn). */
function parseThinking(key: string, raw: unknown): ThinkingConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    log.warn(`"thinking" for stage "${key}" must be an object in the model routes; ignored.`);
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const out: ThinkingConfig = {};
  const checkEnum = <T>(field: string, val: unknown, valid: readonly T[]): T | undefined => {
    if (val === undefined) return undefined;
    if (typeof val === 'string' && (valid as readonly string[]).includes(val)) return val as T;
    log.warn(
      `Invalid ${field} "${String(val)}" for stage "${key}" ignored. Valid: ${valid.join(', ')}`,
    );
    return undefined;
  };
  const mode = checkEnum<ThinkingMode>('mode', o.mode, VALID_MODES);
  if (mode) out.mode = mode;
  const effort = checkEnum<ThinkingEffort>('effort', o.effort, VALID_EFFORTS);
  if (effort) out.effort = effort;
  const level = checkEnum<ThinkingLevel>('level', o.level, VALID_LEVELS);
  if (level) out.level = level;
  if (o.enabled !== undefined) {
    if (typeof o.enabled === 'boolean') out.enabled = o.enabled;
    else
      log.warn(
        `Invalid enabled "${String(o.enabled)}" for stage "${key}" ignored (must be boolean).`,
      );
  }
  if (o.budgetTokens !== undefined) {
    if (typeof o.budgetTokens === 'number') out.budgetTokens = o.budgetTokens;
    else
      log.warn(
        `Invalid budgetTokens "${String(o.budgetTokens)}" for stage "${key}" ignored (must be number).`,
      );
  }
  if (o.excludeReasoningOutput !== undefined) {
    if (typeof o.excludeReasoningOutput === 'boolean')
      out.excludeReasoningOutput = o.excludeReasoningOutput;
    else log.warn(`Invalid excludeReasoningOutput for stage "${key}" ignored (must be boolean).`);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Stages that can be independently routed to a model. Each value is a valid
 * `MODEL_ROUTES` key; the base entries also mirror a `callLLM` source label.
 *
 * `scene-content:<type>` are finer-grained composite keys: when a scene-content
 * request carries an `outline.type`, it routes via the composite key and falls
 * back to the base `scene-content` route (see getStageModel). Only the four
 * core scene types are routable; interactive widget sub-types are not split.
 *
 * `pbl-v2-runtime:<route>` keys follow the same composite fallback pattern:
 * a specific runtime endpoint can be routed independently, or inherit the base
 * `pbl-v2-runtime` model when no endpoint-specific route is configured.
 */
export const LLM_STAGES = [
  'scene-outlines-stream',
  'scene-content',
  'scene-content:slide',
  'scene-content:quiz',
  'scene-content:interactive',
  'scene-content:pbl',
  'scene-actions',
  'agent-profiles',
  'quiz-grade',
  'pbl-chat',
  'pbl-v2-runtime',
  'pbl-v2-runtime:instructor',
  'pbl-v2-runtime:open-task',
  'pbl-v2-runtime:evaluate',
  'pbl-v2-runtime:simulator',
  'chat-adapter',
  'generate-classroom',
  'web-search-query-rewrite',
  'maic-agent',
  'maic-agent-driver',
  'conversation-title',
] as const;

export type LlmStage = (typeof LLM_STAGES)[number];

/** Parsed once per loaded snapshot: a refresh that changes the routes yields a new object to parse. */
let _routes: { source: unknown; routes: Record<string, StageRoute> } | null = null;

/** Parse one MODEL_ROUTES value (string model, or {model, thinking}) into a StageRoute. */
export function parseRouteValue(key: string, value: unknown): StageRoute | undefined {
  if (typeof value === 'string') {
    return value.trim() ? { model: value.trim() } : undefined;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const model = typeof obj.model === 'string' ? obj.model.trim() : '';
    if (!model) {
      log.warn(`Route for stage "${key}" has no model string in the model routes; ignored.`);
      return undefined;
    }
    const route: StageRoute = { model };
    const api = typeof obj.api === 'string' ? obj.api.trim() : '';
    const dialect = typeof obj.dialect === 'string' ? obj.dialect.trim() : '';
    if (api || dialect) route.api = api || dialect;
    if (obj.api !== undefined && !api) {
      log.warn(
        dialect
          ? `Invalid api for stage "${key}" in the model routes; using dialect "${dialect}" instead.`
          : `Invalid api for stage "${key}" in the model routes; ignored.`,
      );
    }
    if (obj.dialect !== undefined && !dialect) {
      log.warn(
        api
          ? `Invalid dialect for stage "${key}" in the model routes; using api "${api}" instead.`
          : `Invalid dialect for stage "${key}" in the model routes; ignored.`,
      );
    }
    if (api && dialect && api !== dialect) {
      log.warn(`Both api and dialect are set for stage "${key}"; api wins.`);
    }
    if (obj.thinking !== undefined) {
      const thinking = parseThinking(key, obj.thinking);
      if (thinking) route.thinking = thinking;
    }
    if (obj.contextWindow !== undefined) {
      const contextWindow = obj.contextWindow;
      if (
        typeof contextWindow === 'number' &&
        Number.isFinite(contextWindow) &&
        Math.floor(contextWindow) >= 1
      ) {
        route.contextWindow = Math.floor(contextWindow);
      } else {
        log.warn(`Invalid contextWindow for stage "${key}" in the model routes; ignored.`);
      }
    }
    return route;
  }
  log.warn(`Invalid route value for stage "${key}" in the model routes ignored.`);
  return undefined;
}

function loadRoutes(): Record<string, StageRoute> {
  const stored = currentSnapshot().routing.routes;
  if (_routes?.source === stored) return _routes.routes;

  const routes: Record<string, StageRoute> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (!(LLM_STAGES as readonly string[]).includes(key)) {
      log.warn(
        `Unknown stage "${key}" in the model routes ignored. Valid stages: ${LLM_STAGES.join(', ')}`,
      );
      continue;
    }
    const route = parseRouteValue(key, value);
    if (route) routes[key] = route;
  }

  _routes = { source: stored, routes };
  return routes;
}

/** The default model string (`provider:model`), or undefined when none is set. */
export function getDefaultModel(): string | undefined {
  return currentSnapshot().routing.defaultModel;
}

/**
 * Resolve the configured model string for a stage, or `undefined` when the
 * stage is unset or unconfigured. Callers choose their fallback; notably,
 * `conversation-title` reuses the agent-driver connection.
 *
 * Composite `a:b` stages resolve most-specific-first: the full key is tried,
 * then successively shorter prefixes (e.g. `scene-content:quiz` →
 * `scene-content`). Plain stages (no colon) are a single exact lookup.
 */
export function getStageRoute(stage?: string): StageRoute | undefined {
  if (!stage) return undefined;
  const routes = loadRoutes();
  let key: string | undefined = stage;
  while (key) {
    const route = routes[key];
    if (route) return route;
    const lastColon = key.lastIndexOf(':');
    key = lastColon > 0 ? key.slice(0, lastColon) : undefined;
  }
  return undefined;
}

/** Convenience: the resolved model string for a stage (route's `model`). */
export function getStageModel(stage?: string): string | undefined {
  return getStageRoute(stage)?.model;
}
