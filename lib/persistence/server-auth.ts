/**
 * DEVELOPMENT-ONLY authentication for the embedded persistence route.
 *
 * The token is NOT a secret: NEXT_PUBLIC_PERSISTENCE_TOKEN is compiled into
 * the public browser bundle, so it is fully visible to every visitor and
 * provides no confidentiality and no user isolation — anyone who can load the
 * page can read and write EVERY learner partition and all documents by
 * supplying an arbitrary x-learner-key. Its only purpose is to keep unrelated
 * network scanners out of a trusted-network endpoint. Suitable only for
 * localhost or trusted-network, single-user deployments.
 *
 * This is the anonymous path. A request with a live account session is identified
 * by that session (lib/server/accounts) and never reaches this module. For an
 * anonymous caller holding the token, the header selects an anonymous learner
 * partition. Keys in the reserved account namespace (`acct:`) are refused here,
 * so the token cannot be used to read an account's runtime data.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import type { AssetPrincipal } from '@openmaic/storage';
import type { RuntimeHttpPrincipal } from '@openmaic/storage/server';

import { createLogger } from '@/lib/logger';
import { resolveSignedInOwnerId } from '@/lib/server/agent-runtime/with-owner';
import { ACCOUNT_OWNER_PREFIX } from '@/lib/server/accounts/service';

const log = createLogger('PersistenceAuth');

type PersistencePrincipal = RuntimeHttpPrincipal & Partial<Pick<AssetPrincipal, 'key'>>;

/**
 * The single asset partition for this deployment shape. Documents have no
 * ownership partition; assets get the same treatment until real auth lands.
 *
 * Exported because the persistence route resolves the asset principal itself,
 * server-side, rather than through this module's client-supplied credentials:
 * assets are one shared partition by design, so there is nothing per-caller for
 * the development authenticator to decide, and routing them through it made
 * every asset request fail in a production build that had not opted into it.
 */
export const SHARED_ASSET_PRINCIPAL = 'shared';

/**
 * Whether the operator explicitly opted the development authenticator into
 * production traffic (PERSISTENCE_ALLOW_INSECURE_DEV_AUTH=true/1). Both the
 * startup warning and the runtime gate read the same opt-in through this one
 * helper so the two copies of the parsing cannot drift.
 */
function insecureDevAuthOptInEnabled(): boolean {
  const optIn = process.env.PERSISTENCE_ALLOW_INSECURE_DEV_AUTH;
  return optIn === 'true' || optIn === '1';
}

/**
 * The development authenticator must never serve production traffic unless the
 * operator explicitly accepts the trade-off. This module provides no user
 * isolation, so production defaults to refusing it entirely (returns undefined,
 * which callers turn into a 401); PERSISTENCE_ALLOW_INSECURE_DEV_AUTH=true is
 * the documented opt-in for trusted-network single-user deployments.
 */
function devAuthenticatorAllowedInCurrentEnvironment(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return insecureDevAuthOptInEnabled();
}

if (process.env.NODE_ENV === 'production' && insecureDevAuthOptInEnabled()) {
  log.warn(
    'Persistence is running the development authenticator in production: it provides no user ' +
      'isolation, so this endpoint must only be reachable on a trusted network. Replace it with ' +
      'real session verification before serving public traffic.',
  );
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function secureEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function authenticatePersistenceCredentials(
  authorization: string | undefined,
  learnerKey: string | undefined,
): PersistencePrincipal | undefined {
  if (!devAuthenticatorAllowedInCurrentEnvironment()) return undefined;

  const token = process.env.PERSISTENCE_DEV_TOKEN;
  if (!token || !authorization || !secureEqual(authorization, `Bearer ${token}`)) return undefined;
  // A header cannot name an account partition. A client whose cached account key
  // outlived its session is refused here rather than served someone else's data.
  if (learnerKey?.startsWith(ACCOUNT_OWNER_PREFIX)) return undefined;

  // Documents are stored without any ownership partition, so assets are
  // stored under one shared principal to match: this authenticator provides
  // no user isolation either way (the header is client-supplied), and a
  // per-header asset partition only meant a converted document's assets
  // became unreadable to every other browser the document was shared with.
  // The learner key still partitions runtime sessions for anonymous requests,
  // which are genuinely per-learner state. A signed-in request is partitioned by
  // its session and never reaches this function.
  return { key: SHARED_ASSET_PRINCIPAL, ...(learnerKey ? { learnerKey } : {}) };
}

export function authenticatePersistenceHeaders(headers: Headers): PersistencePrincipal | undefined {
  return authenticatePersistenceCredentials(
    headers.get('authorization') ?? undefined,
    headers.get('x-learner-key') ?? undefined,
  );
}

export async function authenticatePersistenceRequest(
  req: IncomingMessage,
): Promise<PersistencePrincipal | undefined> {
  return authenticatePersistenceCredentials(
    singleHeader(req.headers.authorization),
    singleHeader(req.headers['x-learner-key']),
  );
}

/**
 * The runtime learner partition for a request that reaches a learner-scoped
 * surface outside the persistence route (the Pi chat whiteboard).
 *
 * A live session is the identity, and the x-learner-key header is not read for
 * it. Otherwise the development binding decides, exactly as before. A session
 * cookie that cannot be checked rejects rather than falling back to the header.
 */
export async function resolveLearnerKeyForRequest(headers: Headers): Promise<string | undefined> {
  const signedInOwnerId = await resolveSignedInOwnerId(headers);
  if (signedInOwnerId !== undefined) return signedInOwnerId;
  const learnerKey = authenticatePersistenceHeaders(headers)?.learnerKey;
  return learnerKey && learnerKey === learnerKey.trim() ? learnerKey : undefined;
}
