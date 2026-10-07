/**
 * One render job end to end (task 3A-07): AST allowlist → render (a runner, no network) → QA gates → manifest check →
 * content-hashed asset files, `clip-sheet.json` and an updated asset index. The steps are injected, so the tests run
 * the whole pipeline with a fake renderer and the real gates. Server-side only: it spawns processes and writes files.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { checkManifest, type ClipManifest } from '@/lib/clips/manifest';
import type { RenderJob } from '@/lib/clips/render-plan';
import type { AnyClipEntry, ClipAsset } from '@/lib/clips/types';

/** Budget of `public/clips/` (SCHEMA Phase 3 §6): at most 10 clips and 30 MB; more go to a volume or S3. */
export const MAX_PUBLIC_CLIPS = 10;
export const MAX_PUBLIC_BYTES = 30 * 1024 * 1024;

/** Writes manifest.json, layout.json, `<chapter>.mp4` and `<chapter>.png` for the job into `workDir`. */
export type Renderer = (job: RenderJob, workDir: string) => Promise<void> | void;

export interface PipelineOptions {
  entry: AnyClipEntry;
  job: RenderJob;
  render: Renderer;
  /** a scratch directory for this job */
  workDir: string;
  /** the directory assets are placed in (`public/clips`), and the URL prefix they are served under */
  outDir: string;
  urlBase?: string;
  /** the repository root, where `manim/qa/*.py` live */
  repoRoot: string;
  python?: string;
}

export interface PipelineResult {
  ok: boolean;
  problems: string[];
  asset?: ClipAsset;
}

function py(opts: PipelineOptions, script: string, args: string[]): string[] {
  const r = spawnSync(
    opts.python ?? 'python3',
    [join(opts.repoRoot, 'manim', 'qa', script), ...args],
    {
      encoding: 'utf8',
      timeout: 600_000,
    },
  );
  if (r.error) return [`${script}: ${r.error.message}`];
  const lines = `${r.stdout}${r.stderr}`.split('\n').filter((l) => l.trim() !== '');
  return r.status === 0
    ? []
    : lines.length > 0
      ? lines.map((l) => `${script}: ${l}`)
      : [`${script}: exited ${r.status}`];
}

const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** The first 12 hex digits of the hash over the manifest and every file it names, in manifest order. */
export function contentHash(dir: string, manifest: ClipManifest): string {
  const h = createHash('sha256');
  h.update(readFileSync(join(dir, 'manifest.json')));
  for (const c of manifest.chapters) {
    h.update(readFileSync(join(dir, c.file)));
    h.update(readFileSync(join(dir, c.posterFile)));
  }
  if (manifest.master) h.update(readFileSync(join(dir, manifest.master.file)));
  return h.digest('hex').slice(0, 12);
}

/** Bytes and distinct clip directories already under `outDir` (each clip is one directory of the form `<clipId>-<hash>`). */
export function publicUsage(outDir: string): { clips: number; bytes: number } {
  if (!existsSync(outDir)) return { clips: 0, bytes: 0 };
  let clips = 0;
  let bytes = 0;
  for (const name of readdirSync(outDir)) {
    const dir = join(outDir, name);
    if (!statSync(dir).isDirectory()) continue;
    clips++;
    for (const f of readdirSync(dir)) bytes += statSync(join(dir, f)).size;
  }
  return { clips, bytes };
}

export async function runRenderJob(opts: PipelineOptions): Promise<PipelineResult> {
  const { entry, job, workDir } = opts;
  mkdirSync(workDir, { recursive: true });

  // 1. the template passes the AST allowlist before it is ever run
  const template = join(opts.repoRoot, job.template);
  if (!existsSync(template))
    return { ok: false, problems: [`template ${job.template} does not exist`] };
  const allow = py(opts, 'allowlist.py', [template]);
  if (allow.length > 0) return { ok: false, problems: allow };

  // 2. render
  try {
    await opts.render(job, workDir);
  } catch (e) {
    return {
      ok: false,
      problems: [`render failed: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
  const manifestPath = join(workDir, 'manifest.json');
  if (!existsSync(manifestPath)) return { ok: false, problems: ['render wrote no manifest.json'] };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ClipManifest;

  // 3. QA gates: video and manifest chapters, text layout, frames
  const problems: string[] = [
    ...py(opts, 'check_video.py', [
      manifestPath,
      '--entry-chapters',
      entry.chapters.map((c) => c.id).join(','),
    ]),
    ...(existsSync(join(workDir, 'layout.json'))
      ? py(opts, 'check_bbox.py', [join(workDir, 'layout.json')])
      : ['layout.json is missing']),
    ...manifest.chapters.flatMap((c) => py(opts, 'check_ssim.py', [join(workDir, c.file)])),
    // 4. the numbers the scene drew against the independent recomputation
    ...checkManifest(entry, job.expectedDisplay, manifest),
  ];
  if (problems.length > 0) return { ok: false, problems };

  // 5. place the files under a content-hashed name
  const hash = contentHash(workDir, manifest);
  const name = `${entry.id}-${hash}`;
  const target = join(opts.outDir, name);
  if (!existsSync(target)) {
    const usage = publicUsage(opts.outDir);
    const incoming = readdirSync(workDir).reduce(
      (n, f) => n + (statSync(join(workDir, f)).isFile() ? statSync(join(workDir, f)).size : 0),
      0,
    );
    if (usage.clips + 1 > MAX_PUBLIC_CLIPS || usage.bytes + incoming > MAX_PUBLIC_BYTES) {
      return {
        ok: false,
        problems: [
          `public clip budget exceeded (${usage.clips} clips, ${usage.bytes} bytes): use a volume or S3`,
        ],
      };
    }
    mkdirSync(target, { recursive: true });
    for (const f of readdirSync(workDir)) {
      if (statSync(join(workDir, f)).isFile() && f !== 'layout.json')
        copyFileSync(join(workDir, f), join(target, f));
    }
    writeFileSync(join(target, 'clip-sheet.json'), `${JSON.stringify(entry.sheet, null, 2)}\n`);
  }
  const base = `${opts.urlBase ?? '/clips'}/${name}`;
  const asset: ClipAsset = {
    chapters: manifest.chapters.map((c) => ({
      id: c.id,
      url: `${base}/${c.file}`,
      poster: `${base}/${c.posterFile}`,
    })),
    ...(manifest.master ? { master: `${base}/${manifest.master.file}` } : {}),
    manifest: `${base}/manifest.json`,
  };
  return { ok: true, problems: [], asset };
}

/** The asset index with one more entry, keys sorted so the generated file does not depend on the order of the jobs. */
export function withAsset(
  index: Readonly<Record<string, ClipAsset>>,
  key: string,
  asset: ClipAsset,
): Record<string, ClipAsset> {
  const next = { ...index, [key]: asset };
  return Object.fromEntries(
    Object.keys(next)
      .sort()
      .map((k) => [k, next[k]]),
  );
}

export { sha };
