/**
 * The four roles an administrator picks a model for, and how a role becomes routes. A role names
 * the base stages only: a stage with a `:` (`scene-content:quiz`) inherits the route of the stage
 * before the colon unless it has its own, so nothing here writes or removes those. A route an
 * administrator set for one of them in the advanced section is left alone.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';
import type { LlmStage } from '@/lib/server/model-routes';
import { DEFAULT_MODEL_STAGE } from '@/lib/server/provider-store/build-config';
import {
  deleteRouting,
  listRouting,
  saveRouting,
  type RoutingView,
} from '@/lib/server/provider-store/store';

import type { RoleChoice, RoleId, Roles } from './contract';

export const PROVIDER_ID = 'omniroute';
const PREFIX = `${PROVIDER_ID}:`;

export const ROLE_STAGES: Record<RoleId, readonly LlmStage[]> = {
  generate: ['scene-outlines-stream', 'scene-content', 'scene-actions', 'agent-profiles'],
  chat: ['pbl-v2-runtime', 'chat-adapter', 'maic-agent-driver'],
  grade: ['quiz-grade', 'pbl-v2-runtime:evaluate'],
  utility: ['conversation-title', 'web-search-query-rewrite'],
};

/** The role a stage belongs to: its own entry, or that of the stage it inherits from. */
export function roleOfStage(stage: string): RoleId | undefined {
  for (const [role, stages] of Object.entries(ROLE_STAGES)) {
    if ((stages as readonly string[]).includes(stage)) return role as RoleId;
  }
  const colon = stage.lastIndexOf(':');
  return colon > 0 ? roleOfStage(stage.slice(0, colon)) : undefined;
}

function storedValue(choice: RoleChoice): Record<string, unknown> {
  return {
    model: `${PREFIX}${choice.model}`,
    vision: choice.vision,
    tools: choice.tools,
    ...(choice.contextWindow ? { contextWindow: choice.contextWindow } : {}),
  };
}

function choiceOf(value: unknown): RoleChoice | undefined {
  const object =
    typeof value === 'string'
      ? { model: value }
      : value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
  const model = typeof object.model === 'string' ? object.model : '';
  if (!model.startsWith(PREFIX) || model.length === PREFIX.length) return undefined;
  const contextWindow = object.contextWindow;
  return {
    model: model.slice(PREFIX.length),
    vision: object.vision === true,
    tools: object.tools === true,
    ...(typeof contextWindow === 'number' && contextWindow > 0 ? { contextWindow } : {}),
  };
}

/** The roles as the stored routes say them: the first stage of each role that points at OmniRoute. */
export function readRoles(rows: readonly RoutingView[]): Roles {
  const byStage = new Map(rows.map((row) => [row.stage, row.value]));
  const roles: Roles = {};
  for (const [role, stages] of Object.entries(ROLE_STAGES)) {
    for (const stage of stages) {
      const choice = choiceOf(byStage.get(stage));
      if (choice) {
        roles[role as RoleId] = choice;
        break;
      }
    }
  }
  return roles;
}

/** Writes every stage of every role, and the default model (the chat role's). */
export async function writeRoles(
  db: AccountQueryable,
  roles: Record<RoleId, RoleChoice>,
  actor: { actorId: string; now: Date },
): Promise<void> {
  const versions = new Map((await listRouting(db)).map((row) => [row.stage, row.version]));
  const targets: [string, RoleChoice][] = [
    [DEFAULT_MODEL_STAGE, roles.chat],
    ...Object.entries(ROLE_STAGES).flatMap(([role, stages]) =>
      stages.map((stage): [string, RoleChoice] => [stage, roles[role as RoleId]]),
    ),
  ];
  for (const [stage, choice] of targets) {
    await saveRouting(db, {
      stage,
      value: storedValue(choice),
      expectedVersion: versions.get(stage) ?? 0,
      ...actor,
    });
  }
}

/** Removes every route (and the default) that points at OmniRoute. Returns the stages it cleared. */
export async function clearOmniRouteRoutes(
  db: AccountQueryable,
  actor: { actorId: string; now: Date },
): Promise<string[]> {
  const cleared: string[] = [];
  for (const row of await listRouting(db)) {
    if (!choiceOf(row.value)) continue;
    if (await deleteRouting(db, { stage: row.stage, expectedVersion: row.version, ...actor })) {
      cleared.push(row.stage);
    }
  }
  return cleared;
}
