/**
 * Renders the math clips that are not in the asset index yet (task 3A-07). Deviation from the card: a .ts file run with
 * `pnpm exec tsx`, like the other scripts that import the catalog.
 *
 *   pnpm exec tsx scripts/render-clips.ts --plan              print the jobs, render nothing
 *   pnpm exec tsx scripts/render-clips.ts [--only <clipId>]   render the missing presets
 *   ... --out-dir <dir>   development: render every preset into <dir>, with no budget and without touching the index
 *
 * The renderer is the command in MANIM_RENDER_CMD (a shell command run once per job inside the pinned image, with no
 * network). It receives CLIP_ID, CLIP_PRESET, CLIP_PARAMS (JSON), CLIP_TEMPLATE and CLIP_OUT in its environment and must
 * write manifest.json, layout.json, <chapter>.mp4 and <chapter>.png into CLIP_OUT. Each job then passes the AST allowlist
 * before the render and the QA gates (manim/qa) after it; accepted files go to public/clips under a content hash and the
 * index lib/clips/generated/asset-index.json is updated. Exit code 1 when any job failed.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CLIP_ASSET_INDEX } from '@/lib/clips/asset-index';
import { runRenderJob, withAsset, type Renderer } from '@/lib/clips/render-pipeline';
import { planRenders } from '@/lib/clips/render-plan';
import { mathClipModules } from '@/lib/subjects/math/clips';

const repoRoot = process.cwd();
const indexFile = path.join(repoRoot, 'lib/clips/generated/asset-index.json');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;

const outDirArg = args.includes('--out-dir') ? args[args.indexOf('--out-dir') + 1] : undefined;
const jobs = planRenders(mathClipModules, outDirArg ? {} : CLIP_ASSET_INDEX, only);
if (args.includes('--plan')) {
  console.log(
    jobs.length === 0
      ? 'nothing to render'
      : jobs.map((j) => `${j.clipId}/${j.presetId}  ${j.cacheKey}`).join('\n'),
  );
  process.exit(0);
}

const command = process.env.MANIM_RENDER_CMD;
if (jobs.length > 0 && !command) {
  console.error('MANIM_RENDER_CMD is not set: nothing can render. Use --plan to see the jobs.');
  process.exit(1);
}

const render: Renderer = (job, workDir) => {
  const r = spawnSync(command!, {
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      CLIP_ID: job.clipId,
      CLIP_PRESET: job.presetId,
      CLIP_PARAMS: JSON.stringify(job.input),
      CLIP_TEMPLATE: job.template,
      CLIP_OUT: workDir,
    },
  });
  if (r.status !== 0) throw new Error(`MANIM_RENDER_CMD exited ${r.status}`);
};

async function main(): Promise<number> {
  let index = JSON.parse(readFileSync(indexFile, 'utf8')) as typeof CLIP_ASSET_INDEX;
  let failed = 0;
  for (const job of jobs) {
    const mod = mathClipModules.find((m) => m.entry.id === job.clipId)!;
    const result = await runRenderJob({
      entry: mod.entry,
      job,
      render,
      workDir: mkdtempSync(path.join(tmpdir(), `clip-${job.clipId}-`)),
      outDir: outDirArg ?? path.join(repoRoot, 'public/clips'),
      unlimited: Boolean(outDirArg),
      repoRoot,
    });
    if (result.ok && result.asset) {
      if (!outDirArg) {
        index = withAsset(index, job.cacheKey, result.asset);
        writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
      }
      console.log(`ok   ${job.clipId}/${job.presetId}`);
    } else {
      failed++;
      console.error(`FAIL ${job.clipId}/${job.presetId}\n  ${result.problems.join('\n  ')}`);
    }
  }
  return failed > 0 ? 1 : 0;
}

main().then((code) => process.exit(code));
