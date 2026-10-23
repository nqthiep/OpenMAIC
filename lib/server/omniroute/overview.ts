/**
 * What the Settings panel needs to know to draw its steps: whether OmniRoute is set up and
 * reachable, what providers it has, whether OpenMAIC has its key, and which roles are chosen.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';
import {
  listCredentialViews,
  listRouting,
  type CredentialView,
} from '@/lib/server/provider-store/store';

import {
  findKey,
  isReachable,
  listConnections,
  openSession,
  OmniRouteError,
  readHealth,
  type KeyRecord,
} from './client';
import { missingOmnirouteEnv, omnirouteConfig } from './config';
import type { OmniRouteKeyInfo, OmniRouteOverview } from './contract';
import { DEEP_LINKS } from './links';
import { PROVIDER_ID, readRoles } from './roles';

/** The stored credential OpenMAIC uses for OmniRoute, if it exists and can be read. */
export async function omnirouteCredential(
  db: AccountQueryable,
): Promise<CredentialView | undefined> {
  const views = await listCredentialViews(db);
  return views.find((view) => view.section === 'providers' && view.providerId === PROVIDER_ID);
}

export function keyInfo(key: KeyRecord, hint: string): OmniRouteKeyInfo {
  return {
    hint,
    createdAt: key.createdAt || new Date().toISOString(),
    noLog: key.noLog,
    dailyLimitUsd: key.dailyLimitUsd,
    connectionIds: key.connectionIds,
  };
}

export async function buildOverview(
  db: AccountQueryable,
  fetchImpl: typeof fetch = fetch,
): Promise<OmniRouteOverview> {
  const empty: OmniRouteOverview = {
    state: 'unconfigured',
    missingEnv: [],
    connections: [],
    key: null,
    roles: {},
    deepLinks: DEEP_LINKS,
  };
  const config = omnirouteConfig();
  if (!config) return { ...empty, missingEnv: missingOmnirouteEnv() };
  if (!(await isReachable(config, fetchImpl))) return { ...empty, state: 'unreachable' };

  try {
    const session = await openSession(config, fetchImpl);
    const [health, connections, key, credential, routing] = await Promise.all([
      readHealth(session),
      listConnections(session),
      findKey(session),
      omnirouteCredential(db),
      listRouting(db),
    ]);
    const usable = credential?.complete === true && credential.readable;
    const ready = usable && key !== undefined;
    const noProviders = !connections.some((connection) => connection.active);
    return {
      state: noProviders ? 'no-providers' : ready ? 'ready' : 'no-key',
      missingEnv: [],
      version: health.version,
      providers: { configured: health.configured, active: health.active },
      connections: connections.map((connection) => ({
        ...connection,
        allowed: ready && key.connectionIds.includes(connection.id),
      })),
      key: ready ? keyInfo(key, credential.keyHint ?? '') : null,
      roles: readRoles(routing),
      deepLinks: DEEP_LINKS,
    };
  } catch (error) {
    if (error instanceof OmniRouteError) return { ...empty, state: 'unreachable' };
    throw error;
  }
}
