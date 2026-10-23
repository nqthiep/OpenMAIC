/**
 * Steps 2 of the panel: give OpenMAIC a key of its own in OmniRoute, limited to the connections
 * the administrator chose, and keep the key encrypted in `provider_credentials`. The key is shown
 * by OmniRoute once, so it goes from OmniRoute's answer straight into the store and nowhere else.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';
import { applyChange } from '@/lib/server/provider-store/admin';
import { deleteCredential, saveCredential } from '@/lib/server/provider-store/store';

import {
  createKey,
  deleteKey,
  findKey,
  listConnections,
  openSession,
  OmniRouteError,
  regenerateKey,
  updateKey,
  type KeyOptions,
} from './client';
import { omnirouteConfig, type OmniRouteConfig } from './config';
import type { OmniRouteKeyInfo } from './contract';
import { keyInfo, omnirouteCredential } from './overview';
import { clearOmniRouteRoutes, PROVIDER_ID } from './roles';

export interface Actor {
  actorId: string;
  now: Date;
}

export function requireConfig(): OmniRouteConfig {
  const config = omnirouteConfig();
  if (!config) throw new OmniRouteError('unconfigured', 'OmniRoute is not set up on this server');
  return config;
}

async function audit(db: AccountQueryable, action: string, actor: Actor): Promise<void> {
  await db.query(
    `INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
     VALUES ($1::text, 'omniroute', $2::text, NULL, $3::timestamptz)`,
    [actor.actorId, action, actor.now.toISOString()],
  );
}

/** Creates the key (or, if OmniRoute already has one for OpenMAIC, changes what it may use). */
export async function connect(
  db: AccountQueryable,
  options: KeyOptions,
  actor: Actor,
): Promise<OmniRouteKeyInfo> {
  const config = requireConfig();
  const session = await openSession(config);
  const active = new Set(
    (await listConnections(session)).filter((item) => item.active).map((item) => item.id),
  );
  if (options.connectionIds.length === 0 || options.connectionIds.some((id) => !active.has(id))) {
    throw new OmniRouteError('no-connections', 'Choose at least one active connection');
  }

  const credential = await omnirouteCredential(db);
  const haveSecret = credential?.complete === true && credential.readable;
  const existing = await findKey(session);
  const baseUrl = `${config.apiUrl}/v1`;

  let secret: string | undefined;
  let record;
  if (!existing) {
    const created = await createKey(session, options);
    secret = created.secret;
    record = created.record;
  } else {
    await updateKey(session, existing.id, options);
    record = {
      ...existing,
      noLog: options.noLog,
      dailyLimitUsd: options.dailyLimitUsd,
      connectionIds: options.connectionIds,
    };
    // OmniRoute never shows a key again, so a key we hold no secret for is replaced.
    if (!haveSecret) secret = await regenerateKey(session, existing.id);
  }

  if (secret || credential?.baseUrl !== baseUrl) {
    await saveCredential(db, {
      section: 'providers',
      providerId: PROVIDER_ID,
      enabled: true,
      baseUrl,
      ...(secret ? { secret: { apiKey: secret } } : {}),
      expectedVersion: credential?.version ?? 0,
      ...actor,
    });
  }
  await audit(db, 'omniroute:connect', actor);
  await applyChange(db);
  return keyInfo(record, secret ? secret.slice(-4) : (credential?.keyHint ?? ''));
}

/** Issues a new secret for the key and stores it. The old secret stops working. */
export async function rotate(db: AccountQueryable, actor: Actor): Promise<OmniRouteKeyInfo> {
  const config = requireConfig();
  const session = await openSession(config);
  const [existing, credential] = await Promise.all([findKey(session), omnirouteCredential(db)]);
  if (!existing || !credential) throw new OmniRouteError('not-ready', 'There is no key to replace');
  const secret = await regenerateKey(session, existing.id);
  await saveCredential(db, {
    section: 'providers',
    providerId: PROVIDER_ID,
    secret: { apiKey: secret },
    expectedVersion: credential.version,
    ...actor,
  });
  await audit(db, 'omniroute:rotate', actor);
  await applyChange(db);
  return keyInfo(existing, secret.slice(-4));
}

/**
 * Forgets OmniRoute: deletes OpenMAIC's key there (if it can be reached), removes the stored
 * credential and clears every route that pointed at it. Returns the stages it cleared.
 */
export async function disconnect(db: AccountQueryable, actor: Actor): Promise<string[]> {
  try {
    const session = await openSession(requireConfig());
    const key = await findKey(session);
    if (key) await deleteKey(session, key.id);
  } catch {
    // The local side is cleaned either way; a key left behind in OmniRoute is found again by name.
  }
  const credential = await omnirouteCredential(db);
  if (credential) {
    await deleteCredential(db, { section: 'providers', providerId: PROVIDER_ID, ...actor });
  }
  const cleared = await clearOmniRouteRoutes(db, actor);
  await audit(db, 'omniroute:disconnect', actor);
  await applyChange(db);
  return cleared;
}
