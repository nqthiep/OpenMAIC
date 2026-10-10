import type { SlotId } from '@/lib/config/model-slots';
import { slotLanguageModel, type SlotResolvedModel } from '@/lib/server/model-config/llm';
import { deploymentConfig, lookupFromLayers } from '@/lib/server/model-config/runtime';
import type { SlotResolution } from '@/lib/server/model-config/resolve-slot';
import type { StageRoute } from '@/lib/server/model-routes';

/**
 * The SubjectTutor roles (ADR 0014). Each one is a capability slot in openmaic.yml (`tutor.*`, see
 * lib/config/model-slots.ts), resolved from the deployment alone: no workspace layer and no fallback to
 * the `llm` default. A role that is not assigned there is off, and its feature fails closed.
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

/** The slot each tutor role is configured through. */
export const TUTOR_SLOTS: Readonly<Record<TutorStage, SlotId>> = {
  'tutor-moderation': 'tutor.moderation',
  'tutor-review-cp': 'tutor.review-cp',
  'tutor-review-cp-2': 'tutor.review-cp-2',
  'tutor-review-math': 'tutor.review-math',
  'tutor-review-math-2': 'tutor.review-math-2',
  'tutor-review-code': 'tutor.review-code',
  'sim-learner': 'tutor.sim-learner',
  'tutor-analyst': 'tutor.analyst',
};

/** A tutor role's model as a route: `provider:model`, plus the slot's thinking and api settings. */
export type RouteValue = StageRoute;

function tutorResolution(stage: TutorStage): SlotResolution {
  return lookupFromLayers(TUTOR_SLOTS[stage], {
    deployment: deploymentConfig().layer,
    workspace: null,
  });
}

/**
 * The route of a tutor role, from its slot in openmaic.yml. Null when the role is unassigned or its slot
 * is turned off. Never falls back to the `llm` default.
 */
export function getTutorRoute(stage: TutorStage): RouteValue | null {
  const resolution = tutorResolution(stage);
  if (resolution.status !== 'assigned' || !resolution.modelId) return null;
  return {
    model: `${resolution.providerId}:${resolution.modelId}`,
    ...(resolution.api ? { api: resolution.api } : {}),
    ...(resolution.thinking ? { thinking: resolution.thinking } : {}),
  };
}

/**
 * The language model of a tutor role, built the way every slot builds its model (keys and endpoints from
 * the deployment's providers). Null when the role is unassigned or disabled. Throws when the slot cannot
 * be built, which the callers treat as a failure.
 */
export async function resolveTutorModel(stage: TutorStage): Promise<SlotResolvedModel | null> {
  const resolution = tutorResolution(stage);
  if (resolution.status !== 'assigned') return null;
  return slotLanguageModel(resolution);
}
