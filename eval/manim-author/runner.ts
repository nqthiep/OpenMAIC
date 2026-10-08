/**
 * Author-loop runner (card 3A-08, SCHEMA Phase 3 S9): the `manim-author` model writes a template for each brief, the file goes
 * through allowlist, a render, the QA gates and the manifest check (the same pipeline as scripts/render-clips.ts), with up to
 * 3 repair rounds. It reports RSR@1, RSR@3 and the token cost; PASS needs RSR@3 >= 90% over all 20 briefs.
 *
 *   pnpm exec tsx eval/manim-author/runner.ts [--dry-run] [--limit N] [--only <briefId>]
 *
 * Needs MODEL_ROUTES='{"manim-author":"<provider:model>"}', MANIM_PY (a python with manim; default python3) and latex on PATH.
 * --dry-run  print the plan and the prompt sizes; no model call, no render
 * --limit N  the first N briefs (a partial run cannot pass)
 * --replay   answer each brief with the committed template of its clip instead of calling a model: a smoke test of the
 *            loop, the sandbox render and the gates. It measures nothing about the model and needs no route.
 * The rendered files go to a temporary directory; nothing is written to the repository.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { runRenderJob } from '@/lib/clips/render-pipeline';
import { clipAssetKey } from '@/lib/clips/assets';
import { getTutorRoute } from '@/lib/tutor/llm-roles';
import { mathClipModules } from '@/lib/subjects/math/clips';
import {
  authorOne,
  buildAuthorPrompt,
  buildAuthorSystem,
  formatReport,
  MAX_ROUNDS,
  summarise,
  type Brief,
  type BriefResult,
  type Check,
  type Llm,
} from './author';

const repoRoot = process.cwd();
const EXAMPLE = path.join(repoRoot, 'manim/templates/amgm_semicircle.py');

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      replay: { type: 'boolean', default: false },
      limit: { type: 'string' },
      only: { type: 'string' },
    },
    strict: true,
  });
  const all = JSON.parse(
    readFileSync(path.join(repoRoot, 'eval/manim-author/briefs.json'), 'utf8'),
  ) as Brief[];
  const planned = all.length;
  let briefs = values.only ? all.filter((b) => b.id === values.only) : all;
  if (values.limit) briefs = briefs.slice(0, Number(values.limit));
  if (briefs.length === 0) {
    console.error('No brief selected.');
    return 2;
  }
  const example = readFileSync(EXAMPLE, 'utf8');
  const route = getTutorRoute('manim-author');
  console.log('=== Manim author loop (S9) ===');
  console.log(`Briefs: ${briefs.length} of ${planned}; up to ${MAX_ROUNDS} rounds each`);
  console.log(
    `Route: manim-author -> ${values.replay ? 'REPLAY (committed templates, no model)' : (route?.model ?? 'MISSING')}`,
  );
  const sizes = briefs.map(
    (b) => buildAuthorPrompt(b, mathClipModules.find((m) => m.entry.id === b.clipId)!).length,
  );
  console.log(
    `Prompt: system ${buildAuthorSystem(example).length} chars, user min ${Math.min(...sizes)} max ${Math.max(...sizes)} chars`,
  );
  if (!route && !values.replay) {
    console.error('Route: MISSING. Set MODEL_ROUTES=\'{"manim-author":"<provider:model>"}\'.');
    return 2;
  }
  if (values['dry-run']) {
    console.log(
      `Dry run: up to ${briefs.length * MAX_ROUNDS} model calls and renders. Nothing called.`,
    );
    return 0;
  }

  let current = '';
  const llm: Llm = values.replay
    ? async () => ({
        text: `\`\`\`python\n${readFileSync(path.join(repoRoot, 'manim/templates', `${current.replace(/-/g, '_')}.py`), 'utf8')}\`\`\``,
        usage: { inputTokens: 0, outputTokens: 0 },
      })
    : async (req) => {
        const [{ callLLM }, { resolveModel }] = await Promise.all([
          import('@/lib/ai/llm'),
          import('@/lib/server/resolve-model'),
        ]);
        const connection = await resolveModel({ stage: 'manim-author' });
        const r = await callLLM(
          {
            model: connection.model,
            system: req.system,
            prompt: req.prompt,
            temperature: 0.2,
            maxOutputTokens: Number(process.env.MANIM_AUTHOR_MAX_TOKENS) || 12000,
            maxRetries: 0,
          },
          'manim-author',
          undefined,
          route!.thinking,
        );
        return {
          text: r.text,
          usage: {
            inputTokens: r.usage?.inputTokens ?? 0,
            outputTokens: r.usage?.outputTokens ?? 0,
          },
        };
      };

  const python = process.env.MANIM_PY ?? 'python3';
  const results: BriefResult[] = [];
  for (const brief of briefs) {
    const mod = mathClipModules.find((m) => m.entry.id === brief.clipId)!;
    const preset = mod.entry.presets.find((p) => p.id === brief.presetId)!;
    const work = mkdtempSync(path.join(tmpdir(), `author-${brief.id}-`));
    let n = 0;
    const check: Check = async (code) => {
      const file = path.join(work, `${mod.entry.id.replace(/-/g, '_')}-${++n}.py`);
      writeFileSync(file, code);
      const result = await runRenderJob({
        entry: mod.entry,
        job: {
          clipId: mod.entry.id,
          presetId: preset.id,
          input: preset.input,
          cacheKey: clipAssetKey(mod.entry, preset.input, 'vi-VN'),
          template: path.relative(repoRoot, file),
          expectedDisplay: mod.expectedDisplay(preset.input as never),
        },
        render: (job, dir) => {
          const r = spawnSync(python, ['manim/render_clip.py'], {
            cwd: repoRoot,
            encoding: 'utf8',
            timeout: 600_000,
            env: {
              ...process.env,
              CLIP_ID: job.clipId,
              CLIP_PARAMS: JSON.stringify(job.input),
              CLIP_TEMPLATE: file,
              CLIP_OUT: dir,
            },
          });
          if (r.status !== 0)
            throw new Error(
              `renderer exited ${r.status}: ${(r.stderr ?? '').trim().split('\n').slice(-6).join(' | ')}`,
            );
        },
        workDir: path.join(work, `out-${n}`),
        outDir: path.join(work, 'placed'),
        unlimited: true,
        repoRoot,
      });
      return { ok: result.ok, problems: result.problems };
    };
    current = brief.clipId;
    const r = await authorOne(brief, mod, { llm, check, example });
    results.push(r);
    console.log(
      `${brief.id}: ${r.solvedAt === null ? 'NOT SOLVED' : `solved in round ${r.solvedAt}`}`,
    );
  }
  const report = summarise(results, planned);
  console.log(`\n${formatReport(report)}`);
  return report.pass ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
    process.exit(2);
  },
);
