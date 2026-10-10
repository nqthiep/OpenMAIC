import { createLogger } from '@/lib/logger';
import type { StageRoute } from '@/lib/server/model-routes';
import type { ThinkingConfig } from '@/lib/types/provider';

const log = createLogger('TutorRoutes');

/**
 * The SubjectTutor roles (ADR 0014). They are kept out of the core `LLM_STAGES`
 * list, which every core stage must map to a model slot; their routes are read
 * from the MODEL_ROUTES environment variable instead, and only for these keys.
 */
export const TUTOR_STAGES = [
  'tutor-moderation',
  'tutor-review-cp',
  'tutor-review-cp-2',
  'tutor-review-math',
  'tutor-review-math-2',
  'tutor-review-code',
  'sim-learner',
  'tutor-analyst',
] as const;

export type TutorStage = (typeof TUTOR_STAGES)[number];

/** Route value of a tutor stage as configured in MODEL_ROUTES. */
export type RouteValue = StageRoute;

let cached: Record<string, StageRoute> | null = null;

/** One MODEL_ROUTES value: a model string, or `{model, api?, thinking?}`. */
function parseRoute(value: unknown): StageRoute | undefined {
  if (typeof value === 'string') return value.trim() ? { model: value.trim() } : undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const model = typeof obj.model === 'string' ? obj.model.trim() : '';
  if (!model) return undefined;
  const route: StageRoute = { model };
  if (typeof obj.api === 'string') route.api = obj.api;
  if (obj.thinking && typeof obj.thinking === 'object' && !Array.isArray(obj.thinking)) {
    route.thinking = obj.thinking as ThinkingConfig;
  }
  return route;
}

function loadTutorRoutes(): Record<string, StageRoute> {
  if (cached) return cached;
  const routes: Record<string, StageRoute> = {};
  const raw = process.env.MODEL_ROUTES?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (!(TUTOR_STAGES as readonly string[]).includes(key)) continue;
          const route = parseRoute(value);
          if (route) routes[key] = route;
        }
      } else {
        log.error('MODEL_ROUTES must be a JSON object; tutor routes are not set.');
      }
    } catch (err) {
      log.error('Invalid MODEL_ROUTES JSON; tutor routes are not set.', err);
    }
  }
  cached = routes;
  return routes;
}

/**
 * Explicit route lookup for tutor stages. Returns exactly the route configured
 * for `stage` in MODEL_ROUTES, or null. Never falls back to DEFAULT_MODEL.
 */
export function getTutorRoute(stage: TutorStage): RouteValue | null {
  return loadTutorRoutes()[stage] ?? null;
}

/** Tests reset the once-per-process parse (env is read on first use). */
export function resetTutorRoutesForTests(): void {
  cached = null;
}

/**
 * The model for a tutor stage, built from its route and the provider's own
 * environment (`<PROVIDER>_API_KEY`, `<PROVIDER>_BASE_URL`). Null when the route
 * is missing: the caller's feature stays off (fail-closed), never DEFAULT_MODEL.
 */
export async function resolveTutorModel(
  stage: TutorStage,
): Promise<import('@/lib/ai/providers').ModelWithInfo | null> {
  const route = getTutorRoute(stage);
  if (!route) return null;
  const { getModel, parseModelString } = await import('@/lib/ai/providers');
  const { providerId, modelId } = parseModelString(route.model);
  const prefix = String(providerId)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_');
  return getModel({
    providerId,
    modelId,
    apiKey: process.env[`${prefix}_API_KEY`]?.trim() ?? '',
    baseUrl: process.env[`${prefix}_BASE_URL`]?.trim() || undefined,
  });
}
