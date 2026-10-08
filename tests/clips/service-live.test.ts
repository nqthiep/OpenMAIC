import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { clipAssetKey } from '@/lib/clips/assets';
import { checkManifest, type ClipManifest } from '@/lib/clips/manifest';
import { getRuntimeAsset, recordRuntimeAsset } from '@/lib/clips/runtime-index';
import { putClipAsset } from '@/lib/clips/asset-store';
import { createManimClient } from '@/lib/clips/service-client';
import { runClipRenderJob } from '@/lib/server/agent-runtime/clip-render';
import { mathClipModules } from '@/lib/subjects/math/clips';

/**
 * Spike S8 / card 3C-09 against a REAL manim-service container (skipped unless MANIM_IT_URL is set):
 *   docker run -d --name ms-live -p 127.0.0.1:18081:8080 -e MANIM_SERVICE_TOKEN=live manim-service:real
 *   docker run -d --name ms-short -p 127.0.0.1:18082:8080 -e MANIM_SERVICE_TOKEN=live -e MANIM_JOB_DEADLINE_MS=4000 manim-service:real
 *   MANIM_IT_URL=http://127.0.0.1:18081 MANIM_IT_SHORT_URL=http://127.0.0.1:18082 MANIM_IT_TOKEN=live pnpm exec vitest run tests/clips/service-live.test.ts
 * The four cases of S8: the placeholder is replaced by the real video, a timeout ends as failed (never a placeholder for
 * ever), a second request with the same parameters answers from the index at once, and two submissions of one key share a job.
 */
const url = process.env.MANIM_IT_URL;
const shortUrl = process.env.MANIM_IT_SHORT_URL;
const token = process.env.MANIM_IT_TOKEN ?? 'live';
const mod = mathClipModules.find((m) => m.entry.id === 'amgm-semicircle')!;
const preset = mod.entry.presets[0];
const request = {
  templateId: mod.entry.id,
  templateRev: mod.entry.engine.templateRev,
  params: preset.input,
  locale: null,
};
const dir = mkdtempSync(path.join(tmpdir(), 'clip-live-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(!url)('the app against the real manim-service (S8)', () => {
  const client = createManimClient({ url: url!, token });
  const key = clipAssetKey(mod.entry, preset.input, 'vi-VN');

  it('the service lists every template at the revision of the app, and agrees on the cache key', async () => {
    const h = await client.health();
    expect(h.kind).toBe('health');
    if (h.kind !== 'health') return;
    for (const m of mathClipModules)
      expect(h.health.templateRevs[m.entry.id], m.entry.id).toBe(m.entry.engine.templateRev);
    const a = await client.submit(request, 'live-1');
    expect(a.kind).toBe('accepted');
    if (a.kind === 'accepted') expect(a.cacheKey).toBe(key);
  });

  it('two submissions with one key share one job (even from two people)', async () => {
    const a = await client.submit(request, 'live-1');
    const b = await client.submit(request, 'live-2');
    expect(a.kind === 'accepted' && b.kind === 'accepted' && a.jobId === b.jobId).toBe(true);
  });

  it('a render ends with the real files stored under their hash, the manifest matches the formulas, and the next request hits the index', async () => {
    const sub = await client.submit(request, 'live-3');
    if (sub.kind !== 'accepted') throw new Error(`submit: ${sub.kind}`);
    const events: { status: string; src?: string }[] = [];
    const refs = Object.fromEntries(mod.entry.chapters.map((c) => [c.id, `gen_vid_${c.id}`]));
    const started = Date.now();
    const out = await runClipRenderJob({
      entry: mod.entry,
      stageId: 'st',
      toolCallId: 'tc',
      jobId: sub.jobId,
      cacheKey: key,
      refs,
      client,
      owner: 'live-3',
      pollMs: 1000,
      timeoutMs: 5 * 60_000,
      put: (b, e) => putClipAsset(b, e, dir),
      record: (k, a) => recordRuntimeAsset(k, a, dir),
      sessionId: 's',
      emitMediaReady: (_s, d) => void events.push({ status: d.status, src: d.src }),
    });
    expect(out.status).toBe('done');
    if (out.status !== 'done') return;
    expect(out.asset.chapters.map((c) => c.id)).toEqual(mod.entry.chapters.map((c) => c.id));
    expect(events.filter((e) => e.status === 'done')).toHaveLength(mod.entry.chapters.length);
    const manifestName = path.basename(out.asset.manifest!);
    const manifest = JSON.parse(readFileSync(path.join(dir, manifestName), 'utf8')) as ClipManifest;
    expect(checkManifest(mod.entry, mod.expectedDisplay(preset.input as never), manifest)).toEqual(
      [],
    );
    // the same request again: answered from the index, no render
    const t = Date.now();
    expect(await getRuntimeAsset(key, dir)).toEqual(out.asset);
    expect(Date.now() - t).toBeLessThan(200);
    console.log(
      `S8: render through the service took ${Math.round((Date.now() - started) / 1000)} s`,
    );
  }, 240_000);
});

describe.skipIf(!shortUrl)('a job that outlives the deadline (S8)', () => {
  it('ends as failed on the service and the app settles every placeholder as failed, with the hint', async () => {
    const client = createManimClient({ url: shortUrl!, token });
    const sub = await client.submit({ ...request, params: { a: 3, b: 7 } }, 'live-4');
    if (sub.kind !== 'accepted') throw new Error(`submit: ${sub.kind}`);
    const events: { status: string; hint?: string }[] = [];
    const out = await runClipRenderJob({
      entry: mod.entry,
      stageId: 'st',
      toolCallId: 'tc2',
      jobId: sub.jobId,
      cacheKey: 'sha256:x',
      refs: Object.fromEntries(mod.entry.chapters.map((c) => [c.id, `gen_vid_t_${c.id}`])),
      client,
      owner: 'live-4',
      fallbackHint: 'use the preset two-eight',
      pollMs: 500,
      timeoutMs: 120_000,
      sessionId: 's',
      emitMediaReady: (_s, d) => void events.push({ status: d.status, hint: d.hint }),
    });
    expect(out.status).toBe('failed');
    expect(events).toHaveLength(mod.entry.chapters.length);
    expect(
      events.every((e) => e.status === 'failed' && e.hint === 'use the preset two-eight'),
    ).toBe(true);
    const st = await client.status(sub.jobId, 'live-4');
    expect(st.kind === 'status' && st.status === 'failed' && st.error === 'deadline').toBe(true);
  }, 180_000);
});
