/**
 * Review-panel runner for the math CLIPS (cards 3A-17, 3B-W; ADR 0014 decisions 3, 7, 8). The walkthrough runner is runner.ts.
 *
 *   pnpm exec tsx eval/tutor-review/clip-runner.ts <clipId> [--dry-run]       review one clip, write its review file
 *   pnpm exec tsx eval/tutor-review/clip-runner.ts --calibrate [--dry-run] [--limit N] [--clean-runs N]
 *
 * Needs MODEL_ROUTES for "tutor-review-math" and "tutor-review-math-2" on two different providers. The review file is
 * lib/subjects/math/reviews/<clipId>@<templateRev>.json with the clip's content hash (an edit to the clip voids it).
 * Calibration: catch >= 90% of the seeded errors and false-block <= 10% of the clean variants; it never writes a review.
 * Exit code: 0 pass, 1 target missed or review failed, 2 cannot run.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { buildClipReviewMaterial } from '@/lib/clips/review-material';
import { getTutorRoute } from '@/lib/tutor/llm-roles';
import {
  buildReviewPrompt,
  providerOf,
  reviewPanel,
  reviewPasses,
  reviewPath,
  type PanelResult,
  type ReviewLlm,
  type ReviewMaterial,
} from '@/lib/tutor/review-schema';
import { mathClipModules } from '@/lib/subjects/math/clips';
import { MIN_CLEAN, exitCode, formatReport, score } from './score';
import type { Outcome, Sample } from './score';
import { cleanClipVariants, seedClipErrors } from './seed-errors-math';

const STAGES = ['tutor-review-math', 'tutor-review-math-2'] as const;
const REVIEW_MAX_OUTPUT_TOKENS = Number(process.env.TUTOR_REVIEW_MAX_OUTPUT_TOKENS) || 4000;
const dirHere = (): string =>
  typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));

async function pool<T, R>(items: readonly T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const spread = <T>(items: readonly T[], n: number): T[] =>
  n >= items.length
    ? [...items]
    : Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    options: {
      calibrate: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      limit: { type: 'string' },
      'clean-runs': { type: 'string' },
      concurrency: { type: 'string', default: '2' },
      'allow-same-provider': { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  const calibrate = values.calibrate;
  if (!calibrate && positionals.length !== 1) throw new Error('give one <clipId> or --calibrate');
  const mod = positionals[0]
    ? mathClipModules.find((m) => m.entry.id === positionals[0])
    : undefined;
  if (!calibrate && !mod) {
    console.error(
      `Clip not found: ${positionals[0]}. Known: ${mathClipModules.map((m) => m.entry.id).join(', ')}`,
    );
    return 2;
  }
  const routes = STAGES.map((s) => getTutorRoute(s));
  console.log(`=== Math clip review panel${calibrate ? ' calibration' : ''} ===`);
  console.log(
    `Panel math: ${STAGES.map((s, i) => `${s} -> ${routes[i]?.model ?? 'MISSING'}`).join(', ')}`,
  );
  if (!routes[0] || !routes[1]) {
    console.error(
      `Route: MISSING ${STAGES.filter((_, i) => !routes[i]).join(', ')}. Set MODEL_ROUTES (two providers).`,
    );
    return exitCode(false);
  }
  if (
    !values['allow-same-provider'] &&
    providerOf(routes[0].model) !== null &&
    providerOf(routes[0].model) === providerOf(routes[1].model)
  ) {
    console.error(
      'Both reviewers are on one provider. Use two providers (or --allow-same-provider for dev/test).',
    );
    return exitCode(false);
  }

  const llm: ReviewLlm = async (req) => {
    const [{ callLLM }, { resolveModel }] = await Promise.all([
      import('@/lib/ai/llm'),
      import('@/lib/server/resolve-model'),
    ]);
    const connection = await resolveModel({ stage: req.stage });
    const result = await callLLM(
      {
        model: connection.model,
        system: req.system,
        prompt: req.prompt,
        temperature: 0,
        maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS,
        maxRetries: 0,
        abortSignal: req.signal,
      },
      req.stage,
      undefined,
      req.route.thinking,
    );
    return result.text;
  };
  const panelOf = (m: ReviewMaterial): Promise<PanelResult> =>
    reviewPanel(
      m,
      STAGES,
      [routes[0]!, routes[1]!],
      llm,
      Number(process.env.TUTOR_REVIEW_TIMEOUT_MS) || undefined,
      {
        allowSameProvider: values['allow-same-provider'],
      },
    );

  if (!calibrate) {
    const material = buildClipReviewMaterial(mod!);
    console.log(
      `Clip: ${mod!.entry.id}@${mod!.entry.engine.templateRev} (${material.frames.length} frames, prompt ${buildReviewPrompt(material).length} chars)`,
    );
    if (values['dry-run']) {
      console.log('Dry run: would make 2 calls. No model called, no file written.');
      return exitCode(true);
    }
    const { verdict, outcomes } = await panelOf(material);
    for (const o of outcomes) if (!o.review) console.error(`Review unusable: ${o.error}`);
    const [a, b] = outcomes.map((o) => o.review);
    if (!a || !b) {
      console.log('RESULT: FAIL (a review is missing; nothing written)');
      return 1;
    }
    const { clipEntryHash } = await import('@/lib/clips/hash');
    const rel = reviewPath('math', mod!.entry.id, mod!.entry.engine.templateRev);
    const file = join(dirHere(), '..', '..', rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      `${JSON.stringify({ entryId: mod!.entry.id, entryRev: mod!.entry.engine.templateRev, contentHash: clipEntryHash(mod!.entry), locale: 'vi-VN', verdict, reviews: [a, b] }, null, 2)}\n`,
    );
    console.log(`Wrote ${rel}\nRESULT: ${verdict.toUpperCase()}`);
    return verdict === 'pass' ? 0 : 1;
  }

  // --- calibration ---
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  const mutants = mathClipModules.flatMap(seedClipErrors);
  const picked = limit === undefined ? mutants : spread(mutants, limit);
  const variants = cleanClipVariants(mathClipModules);
  if (variants.length < MIN_CLEAN) {
    console.error(`Only ${variants.length} distinct clean variants (need >= ${MIN_CLEAN}).`);
    return 2;
  }
  const clean = variants.slice(
    0,
    values['clean-runs'] === undefined ? variants.length : Number(values['clean-runs']),
  );
  const partial = limit !== undefined || clean.length < MIN_CLEAN;
  console.log(
    `Seeded errors: ${picked.length} of ${mutants.length}; clean variants: ${clean.length} (distinct rewrites of the real clips, not independent clips)`,
  );
  const jobs: { sample: Sample; material: ReviewMaterial }[] = [
    ...picked.map((m) => ({
      sample: { id: m.id, kind: 'mutant' as const, group: m.kind },
      material: m.material,
    })),
    ...clean.map((v) => ({
      sample: { id: `${v.id}:clean`, kind: 'clean' as const, group: 'clean' },
      material: v.material,
    })),
  ];
  console.log(
    `Prompt size: max ${Math.max(...jobs.map((j) => buildReviewPrompt(j.material).length))} chars`,
  );
  if (values['dry-run']) {
    console.log(`Dry run: would make ${2 * jobs.length} calls. No model called.`);
    return exitCode(true);
  }
  let done = 0;
  const outcomes = await pool(
    jobs,
    Number(values.concurrency) || 2,
    async (job): Promise<Outcome> => {
      let r: PanelResult | null = null;
      try {
        r = await panelOf(job.material);
      } catch (e) {
        console.error(`${job.sample.id}: ${e instanceof Error ? e.message : e}`);
      }
      if (++done % 10 === 0) console.error(`  ${done}/${jobs.length}`);
      const pass = (i: 0 | 1) =>
        r?.outcomes[i].review ? reviewPasses(r.outcomes[i].review!) : null;
      return { sample: job.sample, verdict: r?.verdict ?? 'fail', passes: [pass(0), pass(1)] };
    },
  );
  const report = score(outcomes, { partial });
  console.log(`\n${formatReport(report)}`);
  return exitCode(true, report);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
    process.exit(2);
  },
);
