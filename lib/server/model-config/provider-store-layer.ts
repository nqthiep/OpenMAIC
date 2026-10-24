/**
 * The provider store as a deployment layer (KHAITAM patch point; see docs/upstream-patch-points.md).
 *
 * KHAITAM keeps the AI providers, the default model and the per-stage routes in the database
 * (`lib/server/provider-store`), edited by an administrator in the settings popup. Upstream's slot
 * resolution (RFC #1701) reads a deployment layer instead. This module translates one into the
 * other, so every call site that resolves through slots (stages, the agent runtime, the media
 * routes) sees what the administrator saved:
 *
 * - providers and the first configured provider of each media capability: `translateLegacyConfig`
 *   over the snapshot's `ServerConfig`, as upstream does for its own legacy variables;
 * - the default model (and its fallback) as the `llm` default, below the workspace and the request;
 * - each stage route as the assignment of the slot its stage belongs to (`STAGE_SLOTS`), in the
 *   deployment layer, so a route outranks what a request names, as it always did here.
 *
 * Several stages can share a slot (`quiz-grade` and `chat-adapter` are both `classroom`). The stage
 * routed first (base stages before `a:b` stages, then `LLM_STAGES` order) fills the slot; each of
 * the others that has a route of its own is returned as a stage override, which `lookupStage`
 * (runtime.ts) applies to that stage alone. A stage without a route of its own uses the slot.
 */
import { parseModelString } from '@/lib/ai/providers';
import { STAGE_SLOTS, type SlotId } from '@/lib/config/model-slots';
import {
  legacyProviderId,
  translateLegacyConfig,
  type LegacyTranslation,
} from '@/lib/server/model-config/legacy-config';
import type { ModelConfigFile, SlotAssignment } from '@/lib/server/model-config/openmaic-yml';
import {
  LLM_STAGES,
  parseRouteValue,
  type LlmStage,
  type StageRoute,
} from '@/lib/server/model-routes';
import type { ProviderSnapshot } from '@/lib/server/provider-store/types';
import type { ModelInfo } from '@/lib/types/provider';

/** Stages the settings used to offer and the app no longer has (chat is Pi-only now). */
const RETIRED_STAGES: ReadonlySet<string> = new Set(['pbl-chat', 'maic-agent']);

/** `providerId:modelId` as openmaic.yml spells a model reference. */
const MODEL_REF = /^[a-z0-9][a-z0-9-]{0,62}:.+$/;

/**
 * The order stages claim a shared slot in: base stages before `a:b` stages, and grading after the
 * stages that talk to the classroom (it has its own role), then `LLM_STAGES` order.
 */
function stageOrder(stage: string): number {
  const rank = stage.includes(':') ? 2000 : stage === 'quiz-grade' ? 1000 : 0;
  return rank + (LLM_STAGES as readonly string[]).indexOf(stage);
}

/** The model reference of a chat model string, or undefined when its provider is not declared. */
function chatReference(modelString: string, declared: ReadonlySet<string>): string | undefined {
  const { providerId, modelId } = parseModelString(modelString);
  const id = legacyProviderId('chat', providerId);
  const ref = `${id}:${modelId}`;
  return declared.has(id) && MODEL_REF.test(ref) ? ref : undefined;
}

function assignmentFor(
  slot: SlotId,
  route: StageRoute,
  ref: string,
  fallback: string | undefined,
): SlotAssignment {
  const agent = slot === 'agent';
  const plain = !route.thinking && !fallback && !(agent && (route.api || route.contextWindow));
  if (plain) return ref;
  return {
    model: ref,
    ...(route.thinking ? { thinking: route.thinking } : {}),
    ...(fallback ? { fallback } : {}),
    // The pi dialect and the compaction window belong to the agent driver only.
    ...(agent && route.api ? { api: route.api } : {}),
    ...(agent && route.contextWindow ? { contextWindow: route.contextWindow } : {}),
  } as SlotAssignment;
}

/** The deployment layer's content and the legacy defaults, from one loaded snapshot. */
export function translateProviderSnapshot(snapshot: ProviderSnapshot): LegacyTranslation & {
  /** Slot assignments from the stage routes (locked: the deployment layer). */
  routeSlots: NonNullable<ModelConfigFile['slots']>;
  /** Routes of stages that share their slot with an earlier routed stage: the slot as that stage sees it. */
  stageOverrides: Partial<Record<LlmStage, { slot: SlotId; assignment: SlotAssignment }>>;
} {
  const { routing } = snapshot;
  const defaultRoute = routing.defaultModel
    ? parseRouteValue('default', routing.defaultValue ?? routing.defaultModel)
    : undefined;
  const translation = translateLegacyConfig(snapshot.config, {
    defaultModel: defaultRoute?.model,
    globalFallback: defaultRoute?.fallback,
  });
  const notices = [...translation.notices];
  const declared = new Set(Object.keys(translation.config.providers ?? {}));
  const routeSlots: NonNullable<ModelConfigFile['slots']> = {};
  const owner = new Map<SlotId, string>();
  const stageOverrides: Partial<Record<LlmStage, { slot: SlotId; assignment: SlotAssignment }>> =
    {};

  const stages = Object.keys(routing.routes).sort((a, b) => stageOrder(a) - stageOrder(b));
  for (const stage of stages) {
    if (RETIRED_STAGES.has(stage)) continue;
    if (!(LLM_STAGES as readonly string[]).includes(stage)) {
      notices.push(`The route for an unknown stage is ignored (${stage.slice(0, 40)})`);
      continue;
    }
    const route = parseRouteValue(stage, routing.routes[stage]);
    if (!route) continue;
    const ref = chatReference(route.model, declared);
    if (!ref) {
      notices.push(`The route for stage ${stage} names a provider without server configuration`);
      continue;
    }
    const slot = STAGE_SLOTS[stage as keyof typeof STAGE_SLOTS];
    const fallback = route.fallback ? chatReference(route.fallback, declared) : undefined;
    const assignment = assignmentFor(slot, route, ref, fallback);
    if (owner.has(slot)) {
      stageOverrides[stage as LlmStage] = { slot, assignment };
      continue;
    }
    routeSlots[slot] = assignment;
    owner.set(slot, stage);
  }
  // The agent never used the default model: without its own route it stays off (as in upstream's
  // translation of DEFAULT_MODEL), and null keeps it from inheriting a routed `llm` root.
  if (Object.keys(routeSlots).length > 0 && !Object.hasOwn(routeSlots, 'agent')) {
    routeSlots.agent = null;
  }

  return { ...translation, notices, routeSlots, stageOverrides };
}

/**
 * What the routes know about a model the catalog does not describe (a gateway such as OmniRoute
 * lists none): whether it takes images or tools, and its context window. Never applied to a model
 * the catalog describes.
 */
export function uncatalogedModelInfo(
  snapshot: ProviderSnapshot,
  providerId: string,
  modelId: string,
): ModelInfo | null {
  const { routing } = snapshot;
  const candidates: StageRoute[] = [];
  if (routing.defaultModel) {
    const route = parseRouteValue('default', routing.defaultValue ?? routing.defaultModel);
    if (route) candidates.push(route);
  }
  for (const [stage, value] of Object.entries(routing.routes)) {
    const route = parseRouteValue(stage, value);
    if (route) candidates.push(route);
  }
  const match = candidates.find((route) => {
    if (route.vision === undefined && route.tools === undefined && !route.contextWindow) {
      return false;
    }
    const named = parseModelString(route.model);
    return named.providerId === providerId && named.modelId === modelId;
  });
  if (!match) return null;
  return {
    id: modelId,
    name: modelId,
    ...(match.contextWindow ? { contextWindow: match.contextWindow } : {}),
    capabilities: {
      streaming: true,
      vision: match.vision ?? false,
      tools: match.tools ?? false,
    },
  };
}
