/**
 * Simulated-learner gate runner (ADR 0014 decisions 5(b) and 7).
 *
 * Per (persona, entry) the persona answers a 5-question pre-test, "reads" the lesson transcript,
 * answers a parallel 5-question post-test and rates "dễ hiểu" 1-5. Arms per persona:
 *   good     post-test after the real lesson transcript
 *   control  the same post-test with NO lesson (the persona's own knowledge and guessing)
 *   bad      post-test after a deliberately degraded lesson (steps shuffled, half dropped, frame
 *            descriptions removed; deterministic)
 * Pass per lesson (all must hold):
 *   - (good - control) >= 20 points, so the lesson itself taught something,
 *   - (good - degraded) >= 10 points, so the test can tell a bad lesson from a good one,
 *   - >= 70% of personas rate the lesson >= 4,
 *   - failed samples <= 10% of all samples.
 * The gate is relative; the pre-test and the absolute gain are reported but not gated.
 *
 * Every arm is sampled k times per persona (default 3, minimum 3) at temperature 0.3 and the
 * LOWER MEDIAN of the successful samples is scored (a single sample is too noisy to gate on).
 * A sample whose model call or JSON parse fails after one retry is recorded as failed, left out
 * of the median and reported; it never aborts the run.
 *
 * Usage (the stage needs a MODEL_ROUTES entry, e.g. MODEL_ROUTES='{"sim-learner":"<provider:model>"}'):
 *   pnpm exec tsx eval/sim-learner/runner.ts [--dry-run] [--limit N] [--concurrency N] [--samples K]
 *
 * --dry-run     print the plan (personas, entries, transcript sizes, route status); no model call
 * --limit N     use N personas, spread evenly (default: all)
 * --samples K   samples per persona and arm (default 3, minimum 3)
 * --concurrency parallel personas (default 3)
 * --calibrate   accepted and ignored: the degraded arm and the control arm always run now
 *
 * Exit code: 0 targets met (or dry run), 1 target missed, 2 cannot run (no route, bad args or
 * files); a dry run without a route exits 2 too.
 */

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { getTutorRoute } from '@/lib/tutor/llm-roles';
import {
  MIN_SAMPLES,
  exitCode,
  formatLesson,
  parsePersonas,
  parseQuestionSet,
  runPersona,
  scoreLesson,
  type Persona,
  type QuestionSet,
  type SampleCount,
  type SimLlm,
} from './score';
import { buildTranscript, degrade, renderTranscript, type TranscriptLine } from './transcript';

const STAGE = 'sim-learner' as const;
const TIMEOUT_MS = 120_000;
const DEGRADE_SEED = 1;
const DISABLED_THINKING = { mode: 'disabled' } as const;

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

/** Exactly `n` items spread evenly over the list (all of them if `n` >= length). */
function spread<T>(items: readonly T[], n: number): T[] {
  if (n >= items.length) return [...items];
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);
}

async function realLlm(): Promise<SimLlm> {
  // Imported late so --dry-run never loads the LLM stack.
  const { callLLM } = await import('@/lib/ai/llm');
  const { resolveTutorModel } = await import('@/lib/tutor/llm-roles');
  return async ({ system, prompt }) => {
    const route = getTutorRoute(STAGE);
    const connection = await resolveTutorModel(STAGE);
    if (!connection) throw new Error(`${STAGE} route is not configured`);
    const result = await callLLM(
      {
        model: connection.model,
        system,
        prompt,
        // Claude 5 models reject `temperature` (the API deprecates it), so they run on their default.
        ...(/^anthropic:claude-[a-z]+-5(-|$)/.test(route?.model ?? '') ? {} : { temperature: 0.3 }),
        // Claude 5 models spend hidden reasoning tokens from this same budget: 300 leaves no visible answer.
        maxOutputTokens: 2000,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
      STAGE,
      undefined,
      route?.thinking ?? DISABLED_THINKING,
    );
    return result.text;
  };
}

interface Lesson {
  set: QuestionSet;
  good: TranscriptLine[];
}

function loadLessons(dir: string): Lesson[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (files.length === 0) throw new Error(`no question files in ${dir}`);
  const entries = new Map(SUBJECT_PACKS.flatMap((p) => p.walkthroughs.map((e) => [e.id, e])));
  return files.map((f) => {
    const set = parseQuestionSet(readFileSync(join(dir, f), 'utf8'), f);
    const entry = entries.get(set.entryId);
    if (!entry) throw new Error(`${f}: unknown entryId "${set.entryId}"`);
    const good = buildTranscript(entry, set.presetId ?? entry.presets[0].id, set.locale);
    if (good.length === 0) throw new Error(`${f}: empty transcript`);
    return { set, good };
  });
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      calibrate: { type: 'boolean', default: false },
      limit: { type: 'string' },
      samples: { type: 'string', default: String(MIN_SAMPLES) },
      concurrency: { type: 'string', default: '3' },
    },
    strict: true,
  });
  const concurrency = positiveInt('concurrency', values.concurrency);
  const limit = values.limit === undefined ? undefined : positiveInt('limit', values.limit);
  const k = positiveInt('samples', values.samples);
  if (k < MIN_SAMPLES) throw new Error(`--samples must be at least ${MIN_SAMPLES}`);

  const dir = getCurrentDir();
  const all = parsePersonas(readFileSync(join(dir, 'personas.json'), 'utf8'), 'personas.json');
  const personas = limit === undefined ? all : spread(all, limit);
  const lessons = loadLessons(join(dir, 'questions'));

  const route = getTutorRoute(STAGE);
  console.log('=== Simulated learner gate ===');
  console.log(
    `Personas: ${personas.length}/${all.length} (${personas.map((p) => p.id).join(', ')})`,
  );
  for (const { set, good } of lessons) {
    console.log(
      `Lesson ${set.entryId}/${set.presetId ?? '(first preset)'} [${set.locale}]: ${good.length} transcript lines, ${set.pre.length}+${set.post.length} questions`,
    );
  }
  console.log(
    `Arms: pre, lesson, no-lesson control, degraded lesson (seed ${DEGRADE_SEED}); ${k} samples each, median scored.`,
  );
  if (!route) {
    // Also in a dry run: a plan that could not be run is not a pass.
    console.error(
      `Route: MISSING. MODEL_ROUTES has no "${STAGE}" entry; set MODEL_ROUTES='{"${STAGE}":"<provider:model>"}'.`,
    );
    return exitCode(false);
  }
  console.log(`Route: ${STAGE} -> ${route.model}`);
  const calls = lessons.length * personas.length * 4 * k;
  if (values['dry-run']) {
    console.log(
      `Dry run: would make ${calls} calls (up to ${2 * calls} with retries), concurrency ${concurrency}. No model called.`,
    );
    return exitCode(true);
  }

  const llm = await realLlm();
  let allOk = true;
  for (const { set, good } of lessons) {
    const lessonText = {
      good: renderTranscript(good),
      bad: renderTranscript(degrade(good, DEGRADE_SEED)),
    };
    const results = await pool(personas, concurrency, async (p: Persona) => {
      const r = await runPersona(p, set, lessonText, llm, k, (what, err) =>
        console.error(`  failed sample: ${what}: ${err instanceof Error ? err.message : err}`),
      );
      const { run } = r;
      console.error(
        `  ${set.entryId} ${p.id}: pre ${run.pre}, lesson ${run.good}, control ${run.control}, degraded ${run.bad}, clarity ${run.clarity}`,
      );
      return r;
    });
    const samples: SampleCount = {
      total: results.reduce((n, r) => n + r.samples.total, 0),
      failed: results.reduce((n, r) => n + r.samples.failed, 0),
    };
    const lesson = scoreLesson(
      results.map((r) => r.run),
      set.post.length,
      samples,
    );
    console.log(`\n${formatLesson(set.entryId, lesson)}`);
    allOk &&= lesson.ok;
  }
  console.log(`\nRESULT: ${allOk ? 'PASS' : 'FAIL'}`);
  return exitCode(true, allOk);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
    process.exit(2);
  },
);
