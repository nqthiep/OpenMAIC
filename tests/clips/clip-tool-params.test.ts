import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clipAssetKey } from '@/lib/clips/assets';
import { createClipProvider } from '@/lib/clips/provider';
import { createClipRegistry } from '@/lib/clips/registry';
import type { ManimClient, StatusResult } from '@/lib/clips/service-client';
import type { ClipAsset } from '@/lib/clips/types';
import { buildClipTool } from '@/lib/server/agent-runtime/clip-tools';
import type { CourseDocument, CourseStore } from '@/lib/server/agent-runtime/course-tools';
import {
  clearPendingMediaTasks,
  getPendingMediaTask,
} from '@/lib/server/agent-runtime/pending-media';
import type { MediaReadyLifecycleData } from '@/lib/agent-runtime/lifecycle';
import type { Scene } from '@/lib/types/stage';
import { fakeAny } from './_fake-clip';

const built = fakeAny({ id: 'built-clip', built: true });
const unbuilt = fakeAny({ id: 'unbuilt-clip', built: false });
const registry = createClipRegistry([{ id: 'p', clips: [built, unbuilt] }]);
const provider = createClipProvider({ findClip: (id) => registry.findClip(id) });

const slide = (id: string, order: number) =>
  ({
    id,
    stageId: 'stage-test',
    order,
    title: id,
    type: 'slide',
    content: { type: 'slide', canvas: { id: `c-${id}`, elements: [] } },
    actions: [],
  }) as unknown as Scene;

function setup(scenes: Scene[] = []) {
  const doc = {
    stage: { id: 'stage-test', name: 'T', createdAt: 1, updatedAt: 1 },
    scenes,
  } as unknown as CourseDocument;
  const store = {
    loadDocument: vi.fn(async () => doc),
    putScene: vi.fn(async (_id: string, scene: Scene) => {
      const i = doc.scenes.findIndex((s) => s.id === scene.id);
      doc.scenes = i < 0 ? [...doc.scenes, scene] : doc.scenes.map((s, j) => (j === i ? scene : s));
    }),
    saveDocument: vi.fn(),
  } as unknown as CourseStore;
  return { store, doc: () => doc.scenes };
}

const flush = async (ms = 60) => new Promise((r) => setTimeout(r, ms));

function fakeClient(over: Partial<ManimClient> = {}) {
  const statuses: StatusResult[] = [
    { kind: 'status', status: 'running', progress: 0.3 },
    { kind: 'status', status: 'succeeded', progress: 1 },
  ];
  const client = {
    submit: vi.fn(async () => ({
      kind: 'accepted' as const,
      jobId: 'job-1',
      cacheKey: 'sha256:server',
    })),
    status: vi.fn(
      async () =>
        statuses.shift() ??
        statuses[statuses.length - 1] ?? {
          kind: 'status' as const,
          status: 'succeeded' as const,
          progress: 1,
        },
    ),
    download: vi.fn(async (_j: string, what: string) => ({
      kind: 'file' as const,
      bytes: new TextEncoder().encode(`bytes-of-${what}`),
      contentType: 'x',
    })),
    cancel: vi.fn(async () => ({ kind: 'cancelled' as const })),
    health: vi.fn(async () => ({
      kind: 'health' as const,
      health: { accepting: true, imageDigest: null, templateRevs: {} },
    })),
    ...over,
  };
  return client as unknown as ManimClient & { [K in keyof typeof client]: (typeof client)[K] };
}

function tool(s: ReturnType<typeof setup>, extra: Record<string, unknown> = {}) {
  const emitted: MediaReadyLifecycleData[] = [];
  const recorded: Record<string, ClipAsset> = {};
  const patched: { ref: string; src: string }[] = [];
  const stored: string[] = [];
  const t = buildClipTool(
    {
      store: s.store,
      stageAccess: async () => ({ kind: 'owned' as const }),
      sessionId: 'sess-1',
      onCheckpoint: vi.fn(),
      backgroundStore: s.store,
      emitMediaReady: (_sid: string, d: MediaReadyLifecycleData) => void emitted.push(d),
      getManimConfig: () => ({ url: 'http://manim', token: 't' }),
      pollMs: 1,
      timeoutMs: 2000,
      put: async (bytes: Uint8Array, ext: string) => {
        const name = `${stored.length}.${ext}`;
        stored.push(`${name}:${new TextDecoder().decode(bytes)}`);
        return { name, url: `/api/clips/${name}`, created: true };
      },
      record: async (key: string, asset: ClipAsset) => void (recorded[key] = asset),
      patch: async (_store: unknown, _stage: string, ref: string, src: string) => (
        patched.push({ ref, src }),
        1
      ),
      lookupRuntimeAsset: async (key: string) => recorded[key] ?? null,
      ...extra,
    } as never,
    { registry, provider },
  );
  const run = async (callId: string, p: Record<string, unknown>) =>
    (await t.execute(
      callId,
      { stageId: 'stage-test', afterOrder: 0, clipId: 'unbuilt-clip', ...p } as never,
      undefined,
    )) as unknown as { details: Record<string, unknown>; isError?: boolean };
  return { run, emitted, recorded, patched, stored };
}

beforeEach(() => clearPendingMediaTasks());
afterEach(() => vi.restoreAllMocks());

describe('generate_clip_scenes with params', () => {
  it('rejects params together with presetId, and params that do not fit the input spec', async () => {
    const s = setup();
    const k = tool(s);
    expect((await k.run('c1', { params: { a: 1, b: 1 }, presetId: 'p1' })).details.error).toBe(
      'params-and-preset',
    );
    const bad = await k.run('c2', { params: { a: 99, b: 1 } });
    expect(bad.details.error).toBe('invalid-params');
    expect((bad.details.issues as string[]).length).toBeGreaterThan(0);
    expect(s.doc()).toHaveLength(0);
  });

  it('a cache hit inserts the pages at once without calling the service', async () => {
    const s = setup();
    const client = fakeClient();
    const k = tool(s, { manimClient: client });
    const out = await k.run('c1', { clipId: 'built-clip', params: { a: 5, b: 6 } });
    expect(out.isError).toBeUndefined();
    expect(out.details).toMatchObject({ cached: true, orders: [1, 2] });
    expect(client.submit).not.toHaveBeenCalled();
    expect(s.doc()).toHaveLength(2);
  });

  it('a hit in the run-time index (an earlier on-demand render) also answers at once', async () => {
    const s = setup();
    const entry = registry.findClip('unbuilt-clip')!;
    const key = clipAssetKey(entry, { a: 3, b: 4 }, 'vi-VN');
    const asset: ClipAsset = {
      chapters: entry.chapters.map((c) => ({
        id: c.id,
        url: `/api/clips/${c.id}.mp4`,
        poster: `/api/clips/${c.id}.png`,
      })),
    };
    const client = fakeClient();
    const k = tool(s, {
      manimClient: client,
      lookupRuntimeAsset: async (x: string) => (x === key ? asset : null),
    });
    const out = await k.run('c1', { params: { a: 3, b: 4 } });
    expect(out.details).toMatchObject({ cached: true });
    expect(client.submit).not.toHaveBeenCalled();
    const first = s.doc()[0].content as unknown as {
      canvas: { elements: { type: string; src?: string }[] };
    };
    expect(first.canvas.elements.find((e) => e.type === 'video')!.src).toBe('/api/clips/first.mp4');
  });

  it('without the render service a miss is clip-render-unavailable, with the presets to use instead', async () => {
    const s = setup();
    const k = tool(s, { getManimConfig: () => null });
    const out = await k.run('c1', { params: { a: 2, b: 2 } });
    expect(out.details).toEqual({ error: 'clip-render-unavailable', validPresetIds: ['p1', 'p2'] });
    expect(s.doc()).toHaveLength(0);
  });

  it('a miss with the service submits the job, inserts pages with placeholders, and returns at once', async () => {
    const s = setup([slide('keep', 1)]);
    const client = fakeClient({
      status: vi.fn(async () => ({
        kind: 'status' as const,
        status: 'running' as const,
        progress: 0.1,
      })),
    } as never);
    const k = tool(s, { manimClient: client, timeoutMs: 50 });
    const out = await k.run('c1', { afterOrder: 0, params: { a: 2, b: 3 } });
    expect(out.details).toMatchObject({ status: 'rendering', jobId: 'job-1' });
    expect(client.submit).toHaveBeenCalledWith(
      { templateId: 'unbuilt-clip', templateRev: 1, params: { a: 2, b: 3 }, locale: null },
      'sess-1',
    );
    const refs = out.details.refs as Record<string, string>;
    expect(Object.keys(refs)).toEqual(['first', 'second']);
    for (const ref of Object.values(refs)) {
      expect(ref).toMatch(/^gen_vid_/);
      expect(getPendingMediaTask(ref)?.status).toBe('generating');
    }
    const videos = s
      .doc()
      .filter((x) => x.id !== 'keep')
      .flatMap((x) =>
        (
          x.content as unknown as { canvas: { elements: { type: string; src?: string }[] } }
        ).canvas.elements.filter((e) => e.type === 'video'),
      );
    expect(videos.map((v) => v.src)).toEqual([refs.first, refs.second]);
    expect(s.doc().find((x) => x.id === 'keep')!.order).toBe(3); // the page that was after moved down by two
    await flush(150); // the job times out in the background; nothing throws
  });

  it('on success: files are stored by hash, the index remembers them, placeholders are patched, media_ready says done', async () => {
    const s = setup();
    const client = fakeClient();
    const k = tool(s, { manimClient: client });
    const out = await k.run('c1', { params: { a: 2, b: 3 } });
    const refs = out.details.refs as Record<string, string>;
    await flush(80);
    expect(k.patched).toEqual([
      { ref: refs.first, src: '/api/clips/0.mp4' },
      { ref: refs.second, src: '/api/clips/2.mp4' },
    ]);
    expect(k.emitted.map((e) => [e.ref, e.status, e.src])).toEqual([
      [refs.first, 'done', '/api/clips/0.mp4'],
      [refs.second, 'done', '/api/clips/2.mp4'],
    ]);
    expect(Object.keys(k.recorded)).toEqual(['sha256:server']);
    expect(k.recorded['sha256:server'].chapters.map((c) => c.id)).toEqual(['first', 'second']);
    expect(k.stored).toContain('0.mp4:bytes-of-first');
    expect(k.stored).toContain('1.png:bytes-of-first.png');
    expect(client.download).toHaveBeenCalledWith('job-1', 'manifest', 'sess-1');
    expect(getPendingMediaTask(refs.first)?.status).toBe('done');
  });

  it('a failed job settles every placeholder as failed and hints at the nearest preset', async () => {
    const s = setup();
    const client = fakeClient({
      status: vi.fn(async () => ({
        kind: 'status' as const,
        status: 'failed' as const,
        progress: 1,
        error: 'qa',
      })),
    } as never);
    const k = tool(s, { manimClient: client });
    const out = await k.run('c1', { params: { a: 4, b: 2 } }); // nearer to p2 (4, 1) than p1 (2, 3)
    const refs = out.details.refs as Record<string, string>;
    await flush(60);
    expect(k.emitted.map((e) => [e.ref, e.status, e.errorCode])).toEqual([
      [refs.first, 'failed', 'provider-or-storage-error'],
      [refs.second, 'failed', 'provider-or-storage-error'],
    ]);
    expect(k.emitted[0].hint).toContain('"p2"');
    expect(getPendingMediaTask(refs.first)?.status).toBe('failed');
    expect(k.patched).toEqual([]);
    expect(Object.keys(k.recorded)).toEqual([]);
  });

  it('a job that never finishes times out: the job is cancelled and the placeholders fail with "timeout"', async () => {
    const s = setup();
    const client = fakeClient({
      status: vi.fn(async () => ({
        kind: 'status' as const,
        status: 'running' as const,
        progress: 0.2,
      })),
    } as never);
    const k = tool(s, { manimClient: client, timeoutMs: 30 });
    await k.run('c1', { params: { a: 2, b: 3 } });
    await flush(120);
    expect(client.cancel).toHaveBeenCalledWith('job-1', 'sess-1');
    expect(k.emitted.every((e) => e.status === 'failed' && e.errorCode === 'timeout')).toBe(true);
    expect(k.emitted).toHaveLength(2);
  });

  it('a network hiccup while polling is retried; a failed download fails the job', async () => {
    const s = setup();
    let n = 0;
    const flaky = fakeClient({
      status: vi.fn(async () =>
        n++ < 2
          ? { kind: 'error' as const, message: 'ECONNRESET' }
          : { kind: 'status' as const, status: 'succeeded' as const, progress: 1 },
      ),
    } as never);
    const ok = tool(s, { manimClient: flaky });
    await ok.run('c1', { params: { a: 2, b: 3 } });
    await flush(80);
    expect(ok.emitted.map((e) => e.status)).toEqual(['done', 'done']);

    const s2 = setup();
    const broken = fakeClient({
      download: vi.fn(async () => ({ kind: 'not-found' as const })),
    } as never);
    const bad = tool(s2, { manimClient: broken });
    await bad.run('c2', { params: { a: 2, b: 3 } });
    await flush(80);
    expect(bad.emitted.map((e) => e.status)).toEqual(['failed', 'failed']);
  });

  it('service refusals become tool errors and insert nothing: busy, template-rev-mismatch, invalid-params, unreachable', async () => {
    const cases: [object, string][] = [
      [{ kind: 'busy', reason: 'queue_full' }, 'clip-render-busy'],
      [{ kind: 'template-rev-mismatch', current: 2 }, 'template-rev-mismatch'],
      [{ kind: 'invalid-params' }, 'invalid-params'],
      [{ kind: 'error', message: 'down' }, 'clip-render-unavailable'],
      [{ kind: 'unauthorized' }, 'clip-render-unavailable'],
    ];
    for (const [reply, error] of cases) {
      const s = setup();
      const k = tool(s, { manimClient: fakeClient({ submit: vi.fn(async () => reply) } as never) });
      const out = await k.run('c1', { params: { a: 2, b: 3 } });
      expect(out.details.error, JSON.stringify(reply)).toBe(error);
      expect(s.doc()).toHaveLength(0);
    }
  });

  it('is idempotent by callId: the same call never submits a second job', async () => {
    const s = setup();
    const client = fakeClient();
    const k = tool(s, { manimClient: client });
    await k.run('c1', { params: { a: 2, b: 3 } });
    const again = await k.run('c1', { params: { a: 2, b: 3 } });
    expect(again.details).toMatchObject({ replay: true });
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(s.doc()).toHaveLength(2);
    await flush(80);
  });

  it('the id list offered to the model includes every clip with the service, only rendered ones without it', () => {
    const base = {
      store: setup().store,
      stageAccess: async () => ({ kind: 'owned' as const }),
      onCheckpoint: vi.fn(),
    } as never;
    const withService = buildClipTool(
      { ...(base as object), getManimConfig: () => ({ url: 'u', token: 't' }) } as never,
      { registry, provider },
    );
    const without = buildClipTool({ ...(base as object), getManimConfig: () => null } as never, {
      registry,
      provider,
    });
    const ids = (t: ReturnType<typeof buildClipTool>) =>
      (
        t.parameters as unknown as { properties: { clipId: { anyOf: { const: string }[] } } }
      ).properties.clipId.anyOf.map((x) => x.const);
    expect(ids(withService)).toEqual(['built-clip', 'unbuilt-clip']);
    expect(ids(without)).toEqual(['built-clip']);
  });
});
