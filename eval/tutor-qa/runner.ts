/**
 * Tutor Q&A eval (TEST-STRATEGY section 6, task 1c-16).
 *
 * Asks the chat teacher the scenario questions about a binary-search frame, A/B:
 *   control    context = the static digest only (`describeWalkthrough` without a runtime state)
 *   treatment  context = `describeWalkthrough` with {preset, frame} from `widgetState`
 * then a judge model grades each answer: Dung, Bam frame, Goi y truoc (and, tracked only,
 * Dung hieu lam). Targets on the treatment arm: Dung 100%, Bam frame >= 90%, Goi y truoc >= 80%.
 *
 * Usage:
 *   pnpm exec tsx eval/tutor-qa/runner.ts [--dry-run] [--limit N] [--concurrency N]
 *
 * Models:
 *   answerer  stage 'chat-adapter': the stage /api/chat uses for the teacher. A MODEL_ROUTES
 *             entry wins, else DEFAULT_MODEL (the same resolution the app does), so the eval
 *             talks to the model students get.
 *   judge     stage 'tutor-analyst', MODEL_ROUTES entry required (no fallback), temperature 0.
 *             No dedicated judge stage exists, so this one is reused. The run is REFUSED (exit 2,
 *             also with --dry-run) when the answerer and the judge resolve to the same
 *             `provider:model`: a model must not grade its own answers.
 *   e.g. MODEL_ROUTES='{"tutor-analyst":"<provider:model>"}'
 *
 * Teacher prompt: a PROXY of the production one (see ./teacher-prompt.ts). It uses the real
 * TUTOR_COACHING from lib/orchestration/prompt-builder.ts; the role and 300-character length
 * lines are copied from lib/chat/pi/prompts.ts, whose helpers are module-private and need a chat
 * request. The answerer sees no tools, whiteboard state or peer agents.
 *
 * Judge: "correct" needs at least one expected fact stated or implied, unless hintFirst applies
 * and the answer is a hint-first reply (see ./judge.ts).
 *
 * --dry-run     print the plan (counts, route status); no model call
 * --limit N     N scenarios, spread evenly (default: all)
 * --concurrency parallel scenario jobs (default 4; each makes 2 answer + 2 judge calls)
 *
 * Exit code: 0 targets met, 1 target missed, 2 cannot run (no route, bad args or scenarios).
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { getTutorRoute, resolveTutorModel } from '@/lib/tutor/llm-roles';
import { createWalkthroughProvider, getTutorLabels } from '@/lib/tutor/provider';
import { steps } from '@/lib/tutor/engine/generate';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { describeWalkthrough } from '@/lib/widgets/describe';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';
import { judge, type JudgeLlm } from './judge';
import { buildTeacherSystem } from './teacher-prompt';
import {
  ARMS,
  exitCode,
  formatReport,
  parseScenarios,
  sameModel,
  score,
  spread,
  type Arm,
  type Outcome,
  type Scenario,
} from './score';

const ANSWER_STAGE = 'chat-adapter' as const;
const JUDGE_STAGE = 'tutor-analyst' as const;
const CALL_TIMEOUT_MS = 120_000;

function getCurrentDir(): string {
  return typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
}

function positiveInt(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer`);
  return n;
}

/** Run `fn` over `items` with at most `n` in flight; results keep input order. */
async function pool<T, R>(items: readonly T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      limit: { type: 'string' },
      concurrency: { type: 'string', default: '4' },
    },
    strict: true,
  });
  const concurrency = positiveInt('concurrency', values.concurrency);
  const limit = values.limit === undefined ? undefined : positiveInt('limit', values.limit);

  const file = parseScenarios(readFileSync(join(getCurrentDir(), 'scenarios.json'), 'utf8'));
  const entries: AnyWalkthroughEntry[] = SUBJECT_PACKS.flatMap((p) => p.walkthroughs);
  const entry = entries.find((e) => e.id === file.entryId);
  if (!entry) {
    console.error(`Entry not found in SUBJECT_PACKS: ${file.entryId}`);
    return 2;
  }
  const deps = { findWalkthrough: (id: string) => entries.find((e) => e.id === id) };
  const provider = createWalkthroughProvider({ ...deps, getLabels: getTutorLabels });

  // Every scenario must point at a real preset and frame.
  const frameCount = new Map<string, number>();
  for (const p of entry.presets) {
    frameCount.set(p.id, steps(entry, p.input, { locale: file.locale }).length);
  }
  for (const s of file.scenarios) {
    const n = frameCount.get(s.presetId);
    if (n === undefined || s.frame >= n) {
      console.error(`Scenario ${s.id}: no frame ${s.frame} in preset "${s.presetId}"`);
      return 2;
    }
  }
  const scenarios = limit === undefined ? file.scenarios : spread(file.scenarios, limit);

  // The answerer is a core stage (deployment configuration), shown here as DEFAULT_MODEL.
  const answerModel = process.env.DEFAULT_MODEL;
  const judgeRoute = getTutorRoute(JUDGE_STAGE);

  console.log('=== Tutor Q&A eval ===');
  console.log(
    `Entry: ${entry.id}@${entry.entryRev}, locale ${file.locale}; scenarios: ${scenarios.length} of ${file.scenarios.length}`,
  );
  const frames = new Set(scenarios.map((s) => `${s.presetId}@${s.frame}`));
  console.log(
    `Frames: ${[...frames].join(', ')}; misconception questions: ${scenarios.filter((s) => s.misconceptionId).length}; full-answer questions: ${scenarios.filter((s) => s.fullAnswerRequested).length}`,
  );
  if (limit !== undefined) console.log(`Partial run: --limit ${limit} scenarios.`);
  console.log(
    `Answerer: ${ANSWER_STAGE} -> ${answerModel ?? 'MISSING'} (deployment configuration)`,
  );
  console.log(`Judge:    ${JUDGE_STAGE} -> ${judgeRoute?.model ?? 'MISSING'}`);
  const missing: string[] = [];
  if (!answerModel) {
    missing.push(`"${ANSWER_STAGE}" configuration or DEFAULT_MODEL`);
  }
  if (!judgeRoute) missing.push(`"${JUDGE_STAGE}" route`);
  if (missing.length > 0) {
    console.error(
      `Route: MISSING ${missing.join(' and ')}. Set MODEL_ROUTES='{"${JUDGE_STAGE}":"<provider:model>"}' and DEFAULT_MODEL (or a "${ANSWER_STAGE}" route).`,
    );
    return exitCode(false);
  }
  if (sameModel(answerModel, judgeRoute?.model)) {
    console.error(
      `Judge: REFUSED. The answerer and the judge are both "${answerModel}"; a model must not grade its own answers. Route "${JUDGE_STAGE}" to a different model.`,
    );
    return exitCode(false);
  }
  const calls = scenarios.length * ARMS.length * 2;
  if (values['dry-run']) {
    console.log(
      `Dry run: would make ${calls} calls (${scenarios.length} scenarios x ${ARMS.length} arms x answer+judge), concurrency ${concurrency}. No model called.`,
    );
    return exitCode(true);
  }

  // Imported late so --dry-run never loads the LLM stack.
  const [{ callLLM }, { resolveModel }, { TUTOR_COACHING }] = await Promise.all([
    import('@/lib/ai/llm'),
    import('@/lib/server/resolve-model'),
    import('@/lib/orchestration/prompt-builder'),
  ]);
  const ask = async (
    stage: typeof ANSWER_STAGE | typeof JUDGE_STAGE,
    system: string,
    prompt: string,
    temperature: number,
  ): Promise<string> => {
    // Answerer: core stage (deployment configuration). Judge: tutor role (MODEL_ROUTES).
    const connection =
      stage === JUDGE_STAGE
        ? await resolveTutorModel(JUDGE_STAGE)
        : await resolveModel({ stage: ANSWER_STAGE });
    if (!connection) throw new Error(`${JUDGE_STAGE} route is not configured`);
    const result = await callLLM(
      {
        model: connection.model,
        system,
        prompt,
        temperature,
        maxOutputTokens: stage === ANSWER_STAGE ? 800 : 600,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      },
      stage,
      undefined,
      stage === JUDGE_STAGE ? getTutorRoute(JUDGE_STAGE)?.thinking : undefined,
    );
    return result.text;
  };
  const judgeLlm: JudgeLlm = ({ system, prompt }) => ask(JUDGE_STAGE, system, prompt, 0);

  const sceneOf = (s: Scenario) =>
    provider.build({ id: entry.id, presetId: s.presetId }, { locale: file.locale }).content;
  const teacherSystem = (digest: string) =>
    buildTeacherSystem({
      entryId: entry.id,
      locale: file.locale,
      digest,
      coaching: TUTOR_COACHING,
    });

  type Job = { scenario: Scenario; arm: Arm };
  const jobs: Job[] = scenarios.flatMap((scenario) => ARMS.map((arm) => ({ scenario, arm })));
  let done = 0;
  const outcomes = await pool(jobs, concurrency, async ({ scenario, arm }): Promise<Outcome> => {
    const scene = {
      id: 'qa',
      stageId: 'qa',
      type: 'interactive',
      title: 'qa',
      order: 0,
      content: sceneOf(scenario),
    };
    const runtime = { preset: scenario.presetId, frame: scenario.frame };
    const truth = describeWalkthrough(scene, runtime, deps);
    const digest = arm === 'treatment' ? truth : describeWalkthrough(scene, undefined, deps);
    try {
      // 0.3: some natural variation, still repeatable enough to compare arms.
      const answer = await ask(ANSWER_STAGE, teacherSystem(digest), scenario.question, 0.3);
      const verdict = await judge(scenario, truth, answer, judgeLlm);
      return { scenario, arm, verdict };
    } catch (err) {
      return {
        scenario,
        arm,
        verdict: null,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      if (++done % 10 === 0) console.error(`  ${done}/${jobs.length}`);
    }
  });

  for (const o of outcomes) {
    if (o.error) console.error(`  ${o.scenario.id}/${o.arm}: ${o.error}`);
  }
  const report = score(outcomes, { partial: limit !== undefined });
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
