/**
 * The render pipeline end to end (task 3A-07) with a fake renderer: ffmpeg draws a moving test pattern that ends in a still
 * hold, the real Python QA gates and the real allowlist run on it. Skipped when ffmpeg or python3 with numpy and Pillow is
 * missing (CI installs them in the `manim-qa` job; the vitest jobs may not have them).
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_PUBLIC_CLIPS,
  contentHash,
  publicUsage,
  runRenderJob,
  withAsset,
  type Renderer,
} from '@/lib/clips/render-pipeline';
import { planRenders } from '@/lib/clips/render-plan';
import type { ClipManifest } from '@/lib/clips/manifest';
import { fakeClip } from './_fake-clip';

const have = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
const READY = have('ffmpeg', ['-version']) && have('python3', ['-c', 'import numpy, PIL']);

const entry = fakeClip({ id: 'fake-clip' });
const module_ = { entry, expectedDisplay: ({ a, b }: { a: number; b: number }) => ({ a, b }) };
const [job] = planRenders([module_], {});

let root = '';
let cached = '';

/** a clean layout and one chapter's pictures: 8 s moving and 2 s held, 720p30 yuv420p */
function writeChapters(dir: string): ClipManifest {
  mkdirSync(dir, { recursive: true });
  const chapters = entry.chapters.map((c) => {
    const mp4 = join(dir, `${c.id}.mp4`);
    spawnSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=1280x720:rate=30:duration=8',
        '-vf',
        'tpad=stop_mode=clone:stop_duration=2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'ultrafast',
        '-crf',
        '34',
        mp4,
      ],
      { timeout: 120_000 },
    );
    spawnSync(
      'ffmpeg',
      ['-v', 'error', '-y', '-i', mp4, '-frames:v', '1', join(dir, `${c.id}.png`)],
      { timeout: 60_000 },
    );
    return {
      id: c.id,
      file: `${c.id}.mp4`,
      posterFile: `${c.id}.png`,
      startSec: c.startSec,
      endSec: c.endSec,
    };
  });
  const manifest: ClipManifest = {
    clipId: entry.id,
    templateRev: 1,
    w: 1280,
    h: 720,
    fps: 30,
    durationSec: 20,
    chapters,
    display: { a: 2, b: 3 },
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(
    join(dir, 'layout.json'),
    JSON.stringify({
      keyframes: [{ t: 1, items: [{ id: 'h', bbox: [-1, 0, 1, 1], tokens: 3, fontSize: 36 }] }],
    }),
  );
  return manifest;
}

/** copies the pre-rendered pictures, then lets the test change something */
const renderer =
  (tweak?: (dir: string) => void): Renderer =>
  (_job, workDir) => {
    cpSync(cached, workDir, { recursive: true });
    tweak?.(workDir);
  };

const base = (extra: Partial<Parameters<typeof runRenderJob>[0]> = {}) => ({
  entry: entry as never,
  job,
  render: renderer(),
  workDir: mkdtempSync(join(root, 'work-')),
  outDir: join(root, 'public-clips'),
  repoRoot: root,
  ...extra,
});

describe.skipIf(!READY)('runRenderJob', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'render-pipeline-'));
    // a repository root with the real QA scripts and one clean template
    cpSync(join(process.cwd(), 'manim', 'qa'), join(root, 'manim', 'qa'), { recursive: true });
    mkdirSync(join(root, 'manim', 'templates'), { recursive: true });
    writeFileSync(
      join(root, job.template),
      'import math\nfrom manim import Scene\n\n\nclass Demo(Scene):\n    def construct(self):\n        self.wait(1)\n',
    );
    cached = join(root, 'cached');
    writeChapters(cached);
  }, 180_000);

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('a good render passes every gate and is placed under a content hash with its sheet and manifest', async () => {
    const r = await runRenderJob(base());
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    const asset = r.asset!;
    expect(asset.chapters.map((c) => c.id)).toEqual(['first', 'second']);
    expect(asset.manifest).toMatch(/^\/clips\/fake-clip-[0-9a-f]{12}\/manifest\.json$/);
    const dir = join(root, 'public-clips', asset.manifest!.split('/')[2]);
    for (const f of [
      'first.mp4',
      'first.png',
      'second.mp4',
      'second.png',
      'manifest.json',
      'clip-sheet.json',
    ])
      expect(existsSync(join(dir, f)), f).toBe(true);
    expect(existsSync(join(dir, 'layout.json'))).toBe(false); // a build artefact, not an asset
    expect(
      JSON.parse(readFileSync(join(dir, 'clip-sheet.json'), 'utf8')).chapters.map(
        (c: { id: string }) => c.id,
      ),
    ).toEqual(['first', 'second']);
  }, 120_000);

  it('the same render gives the same content hash, so a second run reuses the directory', async () => {
    const a = await runRenderJob(base());
    const b = await runRenderJob(base());
    expect(b.asset).toEqual(a.asset);
    expect(publicUsage(join(root, 'public-clips')).clips).toBe(1);
    const manifest = JSON.parse(readFileSync(join(cached, 'manifest.json'), 'utf8'));
    expect(contentHash(cached, manifest)).toMatch(/^[0-9a-f]{12}$/);
  }, 120_000);

  it('a wrong number on the picture is caught by the manifest check', async () => {
    const r = await runRenderJob(
      base({
        render: renderer((d) => {
          const m = JSON.parse(readFileSync(join(d, 'manifest.json'), 'utf8'));
          m.display.a = 2.5;
          writeFileSync(join(d, 'manifest.json'), JSON.stringify(m));
        }),
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('display a is 2.5, want 2 (within 0.001)');
  }, 120_000);

  it('overlapping text fails the layout gate', async () => {
    const r = await runRenderJob(
      base({
        render: renderer((d) => {
          writeFileSync(
            join(d, 'layout.json'),
            JSON.stringify({
              keyframes: [
                {
                  t: 2,
                  items: [
                    { id: 'a', bbox: [0, 0, 2, 1], tokens: 2, fontSize: 36 },
                    { id: 'b', bbox: [1, 0.5, 3, 1.5], tokens: 2, fontSize: 36 },
                  ],
                },
              ],
            }),
          );
        }),
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('check_bbox.py') && p.includes('a overlaps b'))).toBe(
      true,
    );
  }, 120_000);

  it('a missing layout report fails, and so does a chapter missing from the manifest', async () => {
    const noLayout = await runRenderJob(
      base({ render: renderer((d) => rmSync(join(d, 'layout.json'))) }),
    );
    expect(noLayout.problems).toContain('layout.json is missing');
    const oneChapter = await runRenderJob(
      base({
        render: renderer((d) => {
          const m = JSON.parse(readFileSync(join(d, 'manifest.json'), 'utf8'));
          m.chapters = m.chapters.slice(0, 1);
          writeFileSync(join(d, 'manifest.json'), JSON.stringify(m));
        }),
      }),
    );
    expect(oneChapter.ok).toBe(false);
    expect(oneChapter.problems.some((p) => p.includes('differ'))).toBe(true);
  }, 120_000);

  it('a template that breaks the allowlist is refused BEFORE anything is rendered', async () => {
    writeFileSync(join(root, job.template), "import os\nos.system('echo hi')\n");
    let rendered = false;
    const r = await runRenderJob(
      base({
        render: () => {
          rendered = true;
        },
      }),
    );
    expect(rendered).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toContain('allowlist.py');
    writeFileSync(join(root, job.template), 'import math\nfrom manim import Scene\n');
  });

  it('a missing template and a renderer that throws are reported', async () => {
    const missing = await runRenderJob(
      base({ job: { ...job, template: 'manim/templates/none.py' } }),
    );
    expect(missing.problems).toEqual(['template manim/templates/none.py does not exist']);
    const boom = await runRenderJob(
      base({
        render: () => {
          throw new Error('no manim here');
        },
      }),
    );
    expect(boom.problems).toEqual(['render failed: no manim here']);
    const empty = await runRenderJob(base({ render: () => undefined }));
    expect(empty.problems).toEqual(['render wrote no manifest.json']);
  });

  it('the public budget refuses an eleventh clip', async () => {
    const out = join(root, 'full');
    for (let i = 0; i < MAX_PUBLIC_CLIPS; i++) {
      mkdirSync(join(out, `other-${i}`), { recursive: true });
      writeFileSync(join(out, `other-${i}`, 'x.bin'), 'x');
    }
    const r = await runRenderJob(base({ outDir: out }));
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/public clip budget exceeded/);
  }, 120_000);
});

describe('withAsset', () => {
  it('adds an entry and keeps the keys sorted, whatever the order of the jobs', () => {
    const a = { chapters: [] };
    const one = withAsset(withAsset({}, 'sha256:b', a), 'sha256:a', a);
    const two = withAsset(withAsset({}, 'sha256:a', a), 'sha256:b', a);
    expect(Object.keys(one)).toEqual(['sha256:a', 'sha256:b']);
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });

  it('does not change the index it was given', () => {
    const index = { 'sha256:a': { chapters: [] } };
    withAsset(index, 'sha256:b', { chapters: [] });
    expect(Object.keys(index)).toEqual(['sha256:a']);
  });
});
