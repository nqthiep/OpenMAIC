/**
 * Simulated-learner gate runner (ADR 0014 decisions 5(b) and 7).
 *
 * Per (persona, entry): the persona answers a 5-question pre-test, "reads" the lesson transcript,
 * answers a parallel post-test and rates "dễ hiểu" 1-5. Pass: average gain >= 20 points and
 * >= 70% of personas rate >= 4. With --calibrate a deliberately degraded transcript (steps
 * shuffled and dropped) must also gain >= 10 points less than the good one.
 *
 * Usage (the stage needs a MODEL_ROUTES entry, e.g. MODEL_ROUTES='{"sim-learner":"<provider:model>"}'):
 *   pnpm exec tsx eval/sim-learner/runner.ts [--dry-run] [--limit N] [--concurrency N] [--calibrate]
 *
 * --dry-run     print the plan (personas, entries, transcript sizes, route status); no model call
 * --limit N     use N personas, spread evenly (default: all)
 * --calibrate   also run the degraded lesson
 * --concurrency parallel personas (default 3)
 *
 * Exit code: 0 targets met (or dry run), 1 target missed, 2 cannot run (no route, bad args or files).
 */

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { getTutorRoute } from '@/lib/tutor/llm-roles';
import {
  calibrationOk,
  exitCode,
  formatLesson,
  parsePersonas,
  parseQuestionSet,
  scoreLesson,
  takePost,
  takePre,
  type LessonScore,
  type Persona,
  type PersonaRun,
  type QuestionSet,
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
  const { resolveModel } = await import('@/lib/server/resolve-model');
  return async ({ system, prompt }) => {
    const route = getTutorRoute(STAGE);
    const connection = await resolveModel({ stage: STAGE });
    const result = await callLLM(
      {
        model: connection.model,
        system,
        prompt,
        temperature: 0.3,
        maxOutputTokens: 300,
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
      concurrency: { type: 'string', default: '3' },
    },
    strict: true,
  });
  const concurrency = positiveInt('concurrency', values.concurrency);
  const limit = values.limit === undefined ? undefined : positiveInt('limit', values.limit);

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
  if (values.calibrate) console.log(`Calibrate: degraded lesson with seed ${DEGRADE_SEED}.`);
  const calls = lessons.length * personas.length * (values.calibrate ? 3 : 2);
  if (!route) {
    const hint = `MODEL_ROUTES has no "${STAGE}" entry; set MODEL_ROUTES='{"${STAGE}":"<provider:model>"}'.`;
    if (values['dry-run']) console.log(`Route: MISSING (a real run would exit 2). ${hint}`);
    else {
      console.error(`Route: MISSING. ${hint}`);
      return exitCode(false);
    }
  } else {
    console.log(`Route: ${STAGE} -> ${route.model}`);
  }
  if (values['dry-run']) {
    console.log(`Dry run: would make ${calls} calls, concurrency ${concurrency}. No model called.`);
    return exitCode(true);
  }

  const llm = await realLlm();
  let allOk = true;
  for (const { set, good } of lessons) {
    const goodText = renderTranscript(good);
    const badText = renderTranscript(degrade(good, DEGRADE_SEED));
    const runs = await pool(personas, concurrency, async (p: Persona) => {
      const pre = await takePre(p, set, llm);
      const g = await takePost(p, set, goodText, llm);
      const bad = values.calibrate ? await takePost(p, set, badText, llm) : undefined;
      console.error(`  ${set.entryId} ${p.id}: pre ${pre}, post ${g.post}, clarity ${g.clarity}`);
      return {
        good: { personaId: p.id, pre, post: g.post, clarity: g.clarity } satisfies PersonaRun,
        bad:
          bad &&
          ({ personaId: p.id, pre, post: bad.post, clarity: bad.clarity } satisfies PersonaRun),
      };
    });
    const n = set.post.length;
    const goodScore: LessonScore = scoreLesson(
      runs.map((r) => r.good),
      n,
    );
    console.log(`\n${formatLesson(`${set.entryId} (good lesson)`, goodScore)}`);
    let ok = goodScore.ok;
    if (values.calibrate) {
      const badScore = scoreLesson(
        runs.map((r) => r.bad!),
        n,
      );
      const calOk = calibrationOk(goodScore, badScore);
      console.log(formatLesson(`${set.entryId} (degraded lesson)`, badScore));
      console.log(
        `  calibration: good gain - degraded gain = ${(goodScore.gainPct - badScore.gainPct).toFixed(1)} points (target >= 10) ${calOk ? 'PASS' : 'FAIL'}`,
      );
      ok &&= calOk;
    }
    allOk &&= ok;
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
