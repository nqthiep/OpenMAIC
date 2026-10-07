/**
 * Client of the `manim-service` (INTERFACES §6, task 3C-05): submit → poll → download → cancel. Every call returns a
 * value with a `kind`; nothing throws, so the tool that uses it never has to guess what a failure looked like.
 * The token travels in `x-manim-token`; the owner id of the session in `x-openmaic-client` (the per-person limit of
 * the service, never an IP). `fetch` and the timeout are injectable for tests.
 */

export interface ManimClientOptions {
  url: string;
  token: string;
  fetch?: typeof fetch;
  /** per request, in milliseconds */
  timeoutMs?: number;
}

export interface RenderRequest {
  templateId: string;
  templateRev: number;
  params: unknown;
  /** `null` when the clip bakes no text */
  locale: string | null;
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type SubmitResult =
  | { kind: 'accepted'; jobId: string; cacheKey: string }
  | { kind: 'template-rev-mismatch'; current: number | null }
  | { kind: 'busy'; reason: string }
  | { kind: 'invalid-params' }
  | { kind: 'unknown-template' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string };

export type StatusResult =
  | { kind: 'status'; status: JobStatus; progress: number; error?: string }
  | { kind: 'not-found' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string };

export type DownloadResult =
  | { kind: 'file'; bytes: Uint8Array; contentType: string }
  | { kind: 'not-ready' }
  | { kind: 'not-found' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string };

export type CancelResult =
  | { kind: 'cancelled' }
  | { kind: 'not-found' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string };

export interface ServiceHealth {
  accepting: boolean;
  imageDigest: string | null;
  templateRevs: Record<string, number>;
}
export type HealthResult =
  | { kind: 'health'; health: ServiceHealth }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string };

export interface ManimClient {
  submit(req: RenderRequest, client: string): Promise<SubmitResult>;
  status(jobId: string, client: string): Promise<StatusResult>;
  download(jobId: string, chapter: string, client: string): Promise<DownloadResult>;
  cancel(jobId: string, client: string): Promise<CancelResult>;
  health(): Promise<HealthResult>;
}

export const DEFAULT_TIMEOUT_MS = 15_000;
/** The largest file the client accepts from the service (one chapter or a manifest; a master stays far below). */
export const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function createManimClient(opts: ManimClientOptions): ManimClient {
  const base = opts.url.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call(
    path: string,
    init: RequestInit,
    client?: string,
  ): Promise<{ res: Response } | { failure: string }> {
    try {
      const res = await doFetch(`${base}${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          'x-manim-token': opts.token,
          ...(client ? { 'x-openmaic-client': client } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { res };
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      return {
        failure: timedOut
          ? `timeout after ${timeoutMs} ms`
          : e instanceof Error
            ? e.message
            : String(e),
      };
    }
  }

  async function json(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  return {
    async submit(req, client) {
      const r = await call(
        '/render',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(req),
        },
        client,
      );
      if ('failure' in r) return { kind: 'error', message: r.failure };
      const { res } = r;
      const body = await json(res);
      switch (res.status) {
        case 202: {
          if (
            isRecord(body) &&
            typeof body.jobId === 'string' &&
            typeof body.cacheKey === 'string'
          ) {
            return { kind: 'accepted', jobId: body.jobId, cacheKey: body.cacheKey };
          }
          return {
            kind: 'error',
            message: 'the service accepted the job but the reply has no jobId',
          };
        }
        case 400:
          return { kind: 'invalid-params' };
        case 401:
          return { kind: 'unauthorized' };
        case 404:
          return { kind: 'unknown-template' };
        case 409: {
          // the app takes the current revision from the reply, or asks /health when the reply carries none
          const fromBody = isRecord(body) && typeof body.current === 'number' ? body.current : null;
          if (fromBody !== null) return { kind: 'template-rev-mismatch', current: fromBody };
          const h = await this.health();
          return {
            kind: 'template-rev-mismatch',
            current: h.kind === 'health' ? (h.health.templateRevs[req.templateId] ?? null) : null,
          };
        }
        case 429:
          return {
            kind: 'busy',
            reason: isRecord(body) && typeof body.reason === 'string' ? body.reason : 'unknown',
          };
        default:
          return { kind: 'error', message: `unexpected status ${res.status}` };
      }
    },

    async status(jobId, client) {
      const r = await call(`/render/${encodeURIComponent(jobId)}`, { method: 'GET' }, client);
      if ('failure' in r) return { kind: 'error', message: r.failure };
      const { res } = r;
      if (res.status === 401) return { kind: 'unauthorized' };
      if (res.status === 404) return { kind: 'not-found' };
      if (res.status !== 200) return { kind: 'error', message: `unexpected status ${res.status}` };
      const body = await json(res);
      const statuses: JobStatus[] = ['queued', 'running', 'succeeded', 'failed', 'cancelled'];
      if (!isRecord(body) || !statuses.includes(body.status as JobStatus))
        return { kind: 'error', message: 'the status reply is malformed' };
      const progress =
        typeof body.progress === 'number' && Number.isFinite(body.progress)
          ? Math.min(Math.max(body.progress, 0), 1)
          : 0;
      return {
        kind: 'status',
        status: body.status as JobStatus,
        progress,
        ...(typeof body.error === 'string' ? { error: body.error } : {}),
      };
    },

    async download(jobId, chapter, client) {
      const r = await call(
        `/render/${encodeURIComponent(jobId)}/download?chapter=${encodeURIComponent(chapter)}`,
        { method: 'GET' },
        client,
      );
      if ('failure' in r) return { kind: 'error', message: r.failure };
      const { res } = r;
      if (res.status === 401) return { kind: 'unauthorized' };
      if (res.status === 404) return { kind: 'not-found' };
      if (res.status === 409 || res.status === 425) return { kind: 'not-ready' };
      if (res.status !== 200) return { kind: 'error', message: `unexpected status ${res.status}` };
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES)
        return { kind: 'error', message: 'the file is larger than the limit' };
      try {
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength > MAX_DOWNLOAD_BYTES)
          return { kind: 'error', message: 'the file is larger than the limit' };
        return {
          kind: 'file',
          bytes,
          contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        };
      } catch (e) {
        return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    },

    async cancel(jobId, client) {
      const r = await call(`/render/${encodeURIComponent(jobId)}`, { method: 'DELETE' }, client);
      if ('failure' in r) return { kind: 'error', message: r.failure };
      const { res } = r;
      if (res.status === 204 || res.status === 200) return { kind: 'cancelled' };
      if (res.status === 401) return { kind: 'unauthorized' };
      if (res.status === 404) return { kind: 'not-found' };
      return { kind: 'error', message: `unexpected status ${res.status}` };
    },

    async health() {
      const r = await call('/health', { method: 'GET' });
      if ('failure' in r) return { kind: 'error', message: r.failure };
      const { res } = r;
      if (res.status === 401) return { kind: 'unauthorized' };
      if (res.status !== 200) return { kind: 'error', message: `unexpected status ${res.status}` };
      const body = await json(res);
      if (!isRecord(body)) return { kind: 'error', message: 'the health reply is malformed' };
      const revs = isRecord(body.templateRevs)
        ? Object.fromEntries(
            Object.entries(body.templateRevs).filter(([, v]) => typeof v === 'number'),
          )
        : {};
      return {
        kind: 'health',
        health: {
          accepting: body.accepting === true,
          imageDigest: typeof body.imageDigest === 'string' ? body.imageDigest : null,
          templateRevs: revs as Record<string, number>,
        },
      };
    },
  };
}
