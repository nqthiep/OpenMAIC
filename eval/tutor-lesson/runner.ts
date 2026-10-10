/**
 * Tutor lesson-quality eval (TEST-STRATEGY section 6, ADR 0008 rubric, task 2-E1).
 *
 * For each scenario the generator model writes N lesson drafts (JSON: scenes, teacher script,
 * visual pointers, prediction questions) from the brief and the material facts; a judge model
 * grades every draft on the six ADR 0008 criteria. Gates (see ./judge.ts):
 *   Dung       every sample correct against `materialFacts` (hard gate)
 *   clarity, detail, understandable, visual >= 4; lively >= 3.5; waiting predictions >= floor(scenes/3)
 *   per scenario >= 70% of the samples pass (N = 3 means 3/3)
 * Thresholds are [Inference] (ADR 0008): recalibrate after the first run. A failed or unparseable
 * sample is a miss, never retried.
 *
 * Usage:
 *   pnpm exec tsx eval/tutor-lesson/runner.ts [--dry-run] [--limit N] [--samples K] [--concurrency N]
 *
 * Models (stages of lib/server/model-routes.ts; no dedicated stage exists, so existing ones are reused):
 *   generator  stage 'scene-outlines-stream' (the lesson-planning stage): a MODEL_ROUTES entry wins,
 *              else DEFAULT_MODEL, as the app resolves it. Temperature 0.7 so the N samples differ [Unverified].
 *   judge      stage 'tutor-analyst', MODEL_ROUTES entry required (no fallback), temperature 0.
 *   The run is REFUSED (exit 2, also with --dry-run) when both resolve to the same `provider:model`.
 *   e.g. MODEL_ROUTES='{"tutor-analyst":"<provider:model>"}' DEFAULT_MODEL=<other provider:model>
 *
 * --dry-run     print the plan (scenarios, sample and call counts, routes); no model call
 * --limit N     N scenarios, spread evenly (a partial run cannot claim a pass)
 * --samples K   samples per scenario (default 3, minimum 3)
 * --concurrency parallel samples (default 3; each makes one generator and one judge call)
 *
 * Output: the report on stdout (token counts in/out for both roles, NFR-M4); no file is written.
 * Exit code: 0 targets met (or dry run), 1 target missed, 2 cannot run (no route, bad args or
 * scenarios, scenario set below section 6 coverage, same model for both roles).
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { getTutorRoute, resolveTutorModel } from '@/lib/tutor/llm-roles';
import {
  MIN_SAMPLES,
  coverageProblems,
  evaluate,
  exitCode,
  formatReport,
  parseScenarios,
  routeProblems,
  score,
  spread,
  type LessonLlm,
} from './judge';

const GENERATOR_STAGE = 'scene-outlines-stream' as const;
const JUDGE_STAGE = 'tutor-analyst' as const;
const CALL_TIMEOUT_MS = 180_000;

function getCurrentDir(): string {
  return typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
}

function positiveInt(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer`);
  return n;
}

/** One real model call for `stage`. Imported late so --dry-run never loads the LLM stack. */
async function realLlm(
  stage: typeof GENERATOR_STAGE | typeof JUDGE_STAGE,
  temperature: number,
  maxOutputTokens: number,
): Promise<LessonLlm> {
  const [{ callLLM }, { resolveModel }] = await Promise.all([
    import('@/lib/ai/llm'),
    import('@/lib/server/resolve-model'),
  ]);
  return async ({ system, prompt }) => {
    // The generator is a core stage (deployment configuration); the judge is a tutor role.
    const connection =
      stage === JUDGE_STAGE
        ? await resolveTutorModel(JUDGE_STAGE)
        : await resolveModel({ stage: GENERATOR_STAGE });
    if (!connection) throw new Error(`${JUDGE_STAGE} route is not configured`);
    const result = await callLLM(
      {
        model: connection.model,
        system,
        prompt,
        temperature,
        maxOutputTokens,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      },
      stage,
      undefined,
      stage === JUDGE_STAGE ? getTutorRoute(JUDGE_STAGE)?.thinking : undefined,
    );
    const usage = result.totalUsage ?? result.usage;
    return {
      text: result.text,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    };
  };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      limit: { type: 'string' },
      samples: { type: 'string', default: String(MIN_SAMPLES) },
      concurrency: { type: 'string', default: '3' },
    },
    strict: true,
  });
  const concurrency = positiveInt('concurrency', values.concurrency);
  const limit = values.limit === undefined ? undefined : positiveInt('limit', values.limit);
  const samples = positiveInt('samples', values.samples);
  if (samples < MIN_SAMPLES) throw new Error(`--samples must be at least ${MIN_SAMPLES}`);

  const file = parseScenarios(readFileSync(join(getCurrentDir(), 'scenarios.json'), 'utf8'));
  // the math scenarios (card 3B-E1) are a second file, read when it exists
  const mathFile = join(getCurrentDir(), 'scenarios-math.json');
  if (existsSync(mathFile)) {
    const math = parseScenarios(readFileSync(mathFile, 'utf8'));
    if (math.locale !== file.locale)
      throw new Error('scenarios-math.json: locale differs from scenarios.json');
    const taken = new Set(file.scenarios.map((x) => x.id));
    for (const sc of math.scenarios) {
      if (taken.has(sc.id)) throw new Error(`scenarios-math.json: duplicate id ${sc.id}`);
      file.scenarios.push({ ...sc, subject: 'math' });
    }
  }
  const gaps = coverageProblems(file.scenarios);
  if (gaps.length > 0) {
    console.error(`Scenarios: ${gaps.join('; ')}.`);
    return exitCode(false);
  }
  const scenarios = limit === undefined ? file.scenarios : spread(file.scenarios, limit);

  // The generator is a core stage: its model comes from the deployment configuration, shown here as DEFAULT_MODEL.
  const generatorModel = process.env.DEFAULT_MODEL;
  const judgeRoute = getTutorRoute(JUDGE_STAGE);

  console.log('=== Tutor lesson eval ===');
  console.log(
    `Scenarios: ${scenarios.length} of ${file.scenarios.length} (ts10 ${scenarios.filter((s) => s.track === 'ts10').length}, hsg ${scenarios.filter((s) => s.track === 'hsg').length}, exam-problem ${scenarios.filter((s) => s.kind === 'exam-problem').length}, math ${scenarios.filter((s) => s.subject === 'math').length}); locale ${file.locale}; ${samples} samples each`,
  );
  console.log(`Ids: ${scenarios.map((s) => s.id).join(', ')}`);
  if (limit !== undefined) console.log(`Partial run: --limit ${limit} scenarios.`);
  console.log(
    `Generator: ${GENERATOR_STAGE} -> ${generatorModel ?? 'MISSING'} (deployment configuration)`,
  );
  console.log(`Judge:     ${JUDGE_STAGE} -> ${judgeRoute?.model ?? 'MISSING'}`);
  const problems = routeProblems({
    generatorStage: GENERATOR_STAGE,
    judgeStage: JUDGE_STAGE,
    generatorModel,
    judgeModel: judgeRoute?.model,
  });
  if (problems.length > 0) {
    console.error(
      `Route: REFUSED. ${problems.join('; ')}. Set MODEL_ROUTES='{"${JUDGE_STAGE}":"<provider:model>"}' and DEFAULT_MODEL (or a "${GENERATOR_STAGE}" route) on a different model.`,
    );
    return exitCode(false);
  }
  const jobs = scenarios.length * samples;
  if (values['dry-run']) {
    console.log(
      `Dry run: would make ${2 * jobs} calls (${jobs} samples x generate+judge), concurrency ${concurrency}. No model called.`,
    );
    return exitCode(true);
  }

  const [generate, judge] = await Promise.all([
    realLlm(GENERATOR_STAGE, 0.7, 8000),
    realLlm(JUDGE_STAGE, 0, 1500),
  ]);
  let done = 0;
  const run = await evaluate(scenarios, {
    locale: file.locale,
    samples,
    concurrency,
    generate,
    judge,
    onSample: (o) => {
      if (o.error) console.error(`  ${o.scenario.id}#${o.sample}: ${o.error}`);
      if (++done % 3 === 0) console.error(`  ${done}/${jobs}`);
    },
  });
  const report = score(run, { partial: limit !== undefined });
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
