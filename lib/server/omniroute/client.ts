/**
 * What this app asks of OmniRoute, server side only. It signs in to OmniRoute's dashboard with the
 * password it already holds (`OMNIROUTE_ADMIN_PASSWORD`), then uses the dashboard's own management
 * API to read providers and to create or change the one API key OpenMAIC uses. The key itself is
 * only used afterwards for `/v1/*` calls. Nothing here is ever sent to a browser.
 *
 * The management API belongs to OmniRoute's dashboard, not a published contract: every response is
 * read defensively, and a shape it does not recognise degrades to an empty value, not a crash.
 */
import type { OmniRouteConfig } from './config';
import type { OmniRouteConnection, OmniRouteFailure } from './contract';

/** The name of the API key OpenMAIC owns in OmniRoute. */
export const KEY_NAME = 'OpenMAIC';

const TIMEOUT_MS = 10_000;
const CHAT_TIMEOUT_MS = 60_000;

export class OmniRouteError extends Error {
  constructor(
    readonly failure: OmniRouteFailure,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type FetchLike = typeof fetch;

async function send(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new OmniRouteError('unreachable', 'OmniRoute did not answer');
  }
}

/** Whether OmniRoute answers at all. Its liveness route is public. */
export async function isReachable(
  config: OmniRouteConfig,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  try {
    const response = await send(
      fetchImpl,
      `${config.internalUrl}/healthz`,
      { method: 'GET' },
      4_000,
    );
    return response.status < 500;
  } catch {
    return false;
  }
}

export interface Session {
  config: OmniRouteConfig;
  /** `auth_token=…`, ready to put in a Cookie header. */
  cookie: string;
  fetchImpl: FetchLike;
}

/** Signs in to the dashboard. Failing means the password differs, or OmniRoute is locked or down. */
export async function openSession(
  config: OmniRouteConfig,
  fetchImpl: FetchLike = fetch,
): Promise<Session> {
  const response = await send(fetchImpl, `${config.internalUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: config.adminPassword }),
  });
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('auth_token='))
    ?.split(';')[0];
  if (!response.ok || !cookie) {
    throw new OmniRouteError(
      'login-failed',
      'OmniRoute did not accept the sign-in',
      response.status,
    );
  }
  return { config, cookie, fetchImpl };
}

async function manage(
  session: Session,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const response = await send(session.fetchImpl, `${session.config.internalUrl}${path}`, {
    method,
    headers: {
      cookie: session.cookie,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    throw new OmniRouteError('key-failed', `OmniRoute refused ${method} ${path}`, response.status);
  }
  return response.json().catch(() => ({}));
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export interface Health {
  version?: string;
  configured: number;
  active: number;
}

export async function readHealth(session: Session): Promise<Health> {
  const body = record(await manage(session, 'GET', '/api/monitoring/health'));
  const summary = record(body.providerSummary);
  return {
    version: text(body.version) || undefined,
    configured: count(summary.configuredCount),
    active: count(summary.activeCount),
  };
}

/** The provider connections an administrator made in OmniRoute (`allowed` is for the caller to set). */
export async function listConnections(
  session: Session,
): Promise<Omit<OmniRouteConnection, 'allowed'>[]> {
  const body = record(await manage(session, 'GET', '/api/providers'));
  const connections = Array.isArray(body.connections) ? body.connections : [];
  return connections.flatMap((raw) => {
    const item = record(raw);
    const id = text(item.id);
    if (!id) return [];
    const authType = text(item.authType) || 'unknown';
    return [
      {
        id,
        name: text(item.name) || text(item.provider) || id,
        provider: text(item.provider),
        authType,
        active: item.isActive === true,
        // Anything that is not a plain API key (OAuth, a web session) is a plan with its own terms.
        subscription: authType !== 'apikey',
      },
    ];
  });
}

export interface KeyRecord {
  id: string;
  name: string;
  createdAt: string;
  noLog: boolean;
  dailyLimitUsd: number | null;
  connectionIds: string[];
}

function toKeyRecord(raw: unknown): KeyRecord | undefined {
  const item = record(raw);
  const id = text(item.id);
  if (!id) return undefined;
  return {
    id,
    name: text(item.name),
    createdAt: text(item.createdAt),
    noLog: item.noLog === true,
    dailyLimitUsd:
      item.usageLimitEnabled === true && typeof item.dailyUsageLimitUsd === 'number'
        ? item.dailyUsageLimitUsd
        : null,
    connectionIds: Array.isArray(item.allowedConnections)
      ? item.allowedConnections.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

/** The key OpenMAIC owns, if OmniRoute has one under that name. */
export async function findKey(session: Session): Promise<KeyRecord | undefined> {
  const body = record(await manage(session, 'GET', '/api/keys'));
  const keys = Array.isArray(body.keys) ? body.keys : [];
  return keys.map(toKeyRecord).find((key) => key?.name === KEY_NAME);
}

export interface KeyOptions {
  connectionIds: string[];
  noLog: boolean;
  dailyLimitUsd: number | null;
}

const limitFields = (limit: number | null) =>
  limit === null
    ? { usageLimitEnabled: false, dailyUsageLimitUsd: null }
    : { usageLimitEnabled: true, dailyUsageLimitUsd: limit };

/** Creates the key. OmniRoute shows the secret once; it is returned here and nowhere else. */
export async function createKey(
  session: Session,
  options: KeyOptions,
): Promise<{ secret: string; record: KeyRecord }> {
  const body = record(
    await manage(session, 'POST', '/api/keys', {
      name: KEY_NAME,
      noLog: options.noLog,
      allowedConnections: options.connectionIds,
      ...(options.dailyLimitUsd === null ? {} : limitFields(options.dailyLimitUsd)),
    }),
  );
  const secret = text(body.key);
  const created = toKeyRecord(body);
  if (!secret || !created) throw new OmniRouteError('key-failed', 'OmniRoute returned no key');
  return {
    secret,
    record: {
      ...created,
      name: KEY_NAME,
      noLog: options.noLog,
      dailyLimitUsd: options.dailyLimitUsd,
      connectionIds: options.connectionIds,
    },
  };
}

/** Changes what the existing key may use, without changing the secret. */
export async function updateKey(session: Session, id: string, options: KeyOptions): Promise<void> {
  await manage(session, 'PATCH', `/api/keys/${encodeURIComponent(id)}`, {
    noLog: options.noLog,
    connectionAccessMode: 'restricted',
    allowedConnections: options.connectionIds,
    ...limitFields(options.dailyLimitUsd),
  });
}

/** Issues a new secret for the key. The old secret stops working. */
export async function regenerateKey(session: Session, id: string): Promise<string> {
  const body = record(
    await manage(session, 'POST', `/api/keys/${encodeURIComponent(id)}/regenerate`),
  );
  const secret = text(body.key);
  if (!secret) throw new OmniRouteError('key-failed', 'OmniRoute returned no key');
  return secret;
}

export async function deleteKey(session: Session, id: string): Promise<void> {
  await manage(session, 'DELETE', `/api/keys/${encodeURIComponent(id)}`);
}

/** The chat models and combos the key can see (`/v1/models`), as OmniRoute reports them. */
export async function listModels(
  config: OmniRouteConfig,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, unknown>[]> {
  const response = await send(fetchImpl, `${config.apiUrl}/v1/models?kind=chat&prefix=alias`, {
    method: 'GET',
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new OmniRouteError(
      'model-failed',
      'OmniRoute would not list its models',
      response.status,
    );
  }
  const body = record(await response.json().catch(() => ({})));
  return Array.isArray(body.data) ? body.data.map(record) : [];
}

/** One tiny chat request through a model, to show the route works. Returns the time it took. */
export async function pingModel(
  config: OmniRouteConfig,
  apiKey: string,
  model: string,
  fetchImpl: FetchLike = fetch,
): Promise<number> {
  const started = Date.now();
  const response = await send(
    fetchImpl,
    `${config.apiUrl}/v1/chat/completions`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
      }),
    },
    CHAT_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new OmniRouteError('model-failed', 'The model did not answer', response.status);
  }
  return Date.now() - started;
}
