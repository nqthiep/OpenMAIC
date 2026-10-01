import { getStageRoute, type LlmStage, type StageRoute } from '@/lib/server/model-routes';

/** Route value of a stage as configured in MODEL_ROUTES. */
export type RouteValue = StageRoute;

/**
 * Explicit route lookup for tutor stages. Returns exactly the route configured
 * for `stage` in MODEL_ROUTES, or null. Never falls back to DEFAULT_MODEL.
 */
export function getTutorRoute(stage: LlmStage): RouteValue | null {
  return getStageRoute(stage) ?? null;
}
