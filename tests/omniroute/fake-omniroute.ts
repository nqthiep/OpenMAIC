/**
 * A small stand-in for OmniRoute's dashboard and API, shaped after what the real image answered
 * (version 3.8.52): sign-in with a password and an `auth_token` cookie, a public `/healthz`, the
 * management routes the app uses, and `/v1/models` and `/v1/chat/completions` behind a Bearer key.
 * It records every call so a test can say what the app asked for.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeConnection {
  id: string;
  name: string;
  provider: string;
  authType: string;
  isActive: boolean;
}

export interface FakeKey {
  id: string;
  name: string;
  key: string;
  noLog: boolean;
  allowedConnections: string[];
  usageLimitEnabled: boolean;
  dailyUsageLimitUsd: number | null;
  createdAt: string;
}

export interface FakeCall {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

export interface FakeOmniRoute {
  url: string;
  password: string;
  connections: FakeConnection[];
  keys: FakeKey[];
  models: Record<string, unknown>[];
  calls: FakeCall[];
  failChat: boolean;
  close: () => Promise<void>;
}

const SESSION = 'fake-session';

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export async function startFakeOmniRoute(password: string): Promise<FakeOmniRoute> {
  let counter = 0;
  const fake: FakeOmniRoute = {
    url: '',
    password,
    connections: [],
    keys: [],
    models: [],
    calls: [],
    failChat: false,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const body = await readBody(req);
    const method = req.method ?? 'GET';
    fake.calls.push({ method, path: url.pathname, ...(body ? { body } : {}) });
    const send = (status: number, payload: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(payload));
    };
    const signedIn = (req.headers.cookie ?? '').includes(`auth_token=${SESSION}`);
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const keyOk = fake.keys.some((key) => key.key === bearer);

    if (url.pathname === '/healthz') return send(200, { ok: true });
    if (url.pathname === '/api/auth/login' && method === 'POST') {
      return body?.password === fake.password
        ? send(200, { success: true }, { 'set-cookie': `auth_token=${SESSION}; Path=/; HttpOnly` })
        : send(401, { error: 'Invalid password' });
    }
    if (url.pathname.startsWith('/v1/')) {
      if (!keyOk) return send(401, { error: { message: 'Invalid API key' } });
      if (url.pathname === '/v1/models') return send(200, { object: 'list', data: fake.models });
      if (url.pathname === '/v1/chat/completions') {
        return fake.failChat
          ? send(502, { error: { message: 'upstream down' } })
          : send(200, { choices: [{ message: { role: 'assistant', content: 'OK' } }] });
      }
      return send(404, {});
    }
    if (!signedIn) return send(401, { error: 'Authentication required' });

    if (url.pathname === '/api/monitoring/health') {
      const active = fake.connections.filter((c) => c.isActive).length;
      return send(200, {
        status: 'healthy',
        version: '3.8.52',
        providerSummary: {
          catalogCount: 375,
          configuredCount: fake.connections.length,
          activeCount: active,
        },
      });
    }
    if (url.pathname === '/api/providers') {
      return send(200, { connections: fake.connections, total: fake.connections.length });
    }
    if (url.pathname === '/api/keys' && method === 'GET') {
      const keys = fake.keys.map((key) => ({ ...key, key: `${key.key.slice(0, 6)}…` }));
      return send(200, { keys, total: keys.length, allowKeyReveal: false });
    }
    if (url.pathname === '/api/keys' && method === 'POST') {
      counter += 1;
      const limit = typeof body?.dailyUsageLimitUsd === 'number' ? body.dailyUsageLimitUsd : null;
      const key: FakeKey = {
        id: `key-${counter}`,
        name: String(body?.name ?? ''),
        key: `sk-fake-${counter}-abcdef${counter}`,
        noLog: body?.noLog === true,
        allowedConnections: (body?.allowedConnections as string[]) ?? [],
        usageLimitEnabled: body?.usageLimitEnabled === true,
        dailyUsageLimitUsd: limit,
        createdAt: '2026-10-23T10:00:00.000Z',
      };
      fake.keys.push(key);
      return send(201, key);
    }
    const match = /^\/api\/keys\/([^/]+)(\/regenerate)?$/.exec(url.pathname);
    const found = match ? fake.keys.find((key) => key.id === match[1]) : undefined;
    if (match && !found) return send(404, { error: 'No such key' });
    if (match && found && match[2] && method === 'POST') {
      counter += 1;
      found.key = `sk-fake-${counter}-regen${counter}`;
      return send(200, {
        message: 'API key regenerated successfully',
        key: found.key,
        id: found.id,
      });
    }
    if (match && found && method === 'PATCH') {
      Object.assign(found, body ?? {});
      return send(200, { message: 'updated' });
    }
    if (match && found && method === 'DELETE') {
      fake.keys.splice(fake.keys.indexOf(found), 1);
      return send(200, { message: 'deleted' });
    }
    return send(404, {});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return fake;
}

export const connection = (
  id: string,
  overrides: Partial<FakeConnection> = {},
): FakeConnection => ({
  id,
  name: id,
  provider: 'openai',
  authType: 'apikey',
  isActive: true,
  ...overrides,
});

export const model = (
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  object: 'model',
  name: id,
  owned_by: id.includes('/') ? id.split('/')[0] : 'combo',
  ...extra,
});
