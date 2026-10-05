/**
 * Review-panel runner (INTERFACES 8.2, ADR 0014 decisions 3, 7, 8).
 *
 * Review one entry with the two panel models and store the result:
 *   pnpm exec tsx eval/tutor-review/runner.ts <entryId> [--dry-run]
 * Calibrate the panel on seeded errors and unmodified entries:
 *   pnpm exec tsx eval/tutor-review/runner.ts --calibrate [<entryId>] [--dry-run] [--limit N] [--clean-runs N]
 *
 * Both stages need a MODEL_ROUTES entry, e.g.
 *   MODEL_ROUTES='{"tutor-review-cp":"<provider:model>","tutor-review-cp-2":"<provider:model>"}'
 *
 * --dry-run      print the plan (counts, route status); no model call, no file written
 * --calibrate    seeded-error calibration: catch >= 90% of mutants, false-block <= 10% of unmodified
 *                entries (each entry run --clean-runs times, default 10); never writes a review file
 * --limit N      N mutants, spread evenly (default: all)
 * --clean-runs N unmodified runs in --calibrate (default 10)
 * --concurrency  parallel samples (default 2; each sample makes two model calls)
 *
 * A real review writes lib/subjects/<subject>/reviews/<entryId>@<entryRev>.json.
 * Exit code: 0 pass, 1 target missed or review failed, 2 cannot run (no route, bad args or entry).
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { getTutorRoute } from '@/lib/tutor/llm-roles';
import type { RouteValue } from '@/lib/tutor/llm-roles';
import {
  buildReviewMaterial,
  buildReviewPrompt,
  reviewPanel,
  reviewPasses,
  reviewPath,
  type PanelResult,
  type ReviewLlm,
  type ReviewMaterial,
} from '@/lib/tutor/review-schema';
import type { LlmStage } from '@/lib/server/model-routes';
import { SUBJECT_PACKS } from '@/lib/subjects';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';
import { exitCode, formatReport, score } from './score';
import type { Outcome, Sample } from './score';
import { seedErrors } from './seed-errors';

/** Panel stages per subject; only `cp` has them in LLM_STAGES today. */
const PANELS: Readonly<Record<string, readonly [LlmStage, LlmStage]>> = {
  cp: ['tutor-review-cp', 'tutor-review-cp-2'],
};
const LOCALE = 'vi-VN';

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

/** `n` items spread evenly over the list (all of them if `n` >= length). */
function spread<T>(items: readonly T[], n: number): T[] {
  if (n >= items.length) return [...items];
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);
}

function countBy(items: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const g of items) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts].map(([g, c]) => `${g}=${c}`).join(' ');
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    options: {
      calibrate: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      limit: { type: 'string' },
      'clean-runs': { type: 'string', default: '10' },
      concurrency: { type: 'string', default: '2' },
    },
    allowPositionals: true,
    strict: true,
  });
  const concurrency = positiveInt('concurrency', values.concurrency);
  const cleanRuns = positiveInt('clean-runs', values['clean-runs']);
  const limit = values.limit === undefined ? undefined : positiveInt('limit', values.limit);
  const calibrate = values.calibrate;
  const dryRun = values['dry-run'];
  if (positionals.length > 1) throw new Error('at most one <entryId>');
  if (!calibrate && positionals.length === 0) throw new Error('give an <entryId> or --calibrate');
  if (!calibrate && (limit !== undefined || values['clean-runs'] !== '10')) {
    throw new Error('--limit and --clean-runs only apply to --calibrate');
  }

  const all = SUBJECT_PACKS.flatMap((p) => p.walkthroughs);
  const entries: AnyWalkthroughEntry[] = positionals.length
    ? all.filter((e) => e.id === positionals[0])
    : all;
  if (entries.length === 0) {
    console.error(`Entry not found: ${positionals[0] ?? '(no entries in SUBJECT_PACKS)'}`);
    return 2;
  }
  const subjects = [...new Set(entries.map((e) => e.subject))];
  const stagesOf = (subject: string) => PANELS[subject];
  const noPanel = subjects.filter((s) => !stagesOf(s));
  if (noPanel.length > 0) {
    console.error(`No review stages for subject(s): ${noPanel.join(', ')}.`);
    return 2;
  }

  // Routes per subject; a missing one makes the run impossible (no fallback to DEFAULT_MODEL).
  const routes = new Map<string, [RouteValue, RouteValue]>();
  const missing: string[] = [];
  for (const s of subjects) {
    const stages = stagesOf(s);
    const rs = stages.map((st) => getTutorRoute(st));
    stages.forEach((st, i) => !rs[i] && missing.push(st));
    if (rs[0] && rs[1]) routes.set(s, [rs[0], rs[1]]);
  }

  console.log(`=== Tutor review panel${calibrate ? ' calibration' : ''} ===`);
  for (const s of subjects) {
    const [a, b] = stagesOf(s);
    const [ra, rb] = routes.get(s) ?? [];
    console.log(`Panel ${s}: ${a} -> ${ra?.model ?? 'MISSING'}, ${b} -> ${rb?.model ?? 'MISSING'}`);
  }
  if (missing.length > 0) {
    console.error(
      `Route: MISSING ${missing.join(', ')}. Set MODEL_ROUTES='{"${missing[0]}":"<provider:model>"}' (a panel needs both stages, on two providers).`,
    );
    return exitCode(false);
  }

  // Imported late so --dry-run never loads the LLM stack.
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
        maxOutputTokens: 4000,
        maxRetries: 0,
        abortSignal: req.signal,
      },
      req.stage,
      undefined,
      req.route.thinking,
    );
    return result.text;
  };
  const panelOf = (e: AnyWalkthroughEntry, material: ReviewMaterial): Promise<PanelResult> =>
    reviewPanel(material, stagesOf(e.subject), routes.get(e.subject)!, llm);

  if (!calibrate) return reviewOne(entries[0], dryRun, panelOf);

  // --- calibration ---
  const mutants = entries.flatMap((e) => seedErrors(e, LOCALE));
  const picked = limit === undefined ? mutants : spread(mutants, limit);
  const clean = Array.from({ length: cleanRuns }, (_, i) => entries[i % entries.length]);
  console.log(
    `Seeded errors: ${picked.length} of ${mutants.length} (${countBy(picked.map((m) => m.kind))})`,
  );
  console.log(`Unmodified:    ${clean.length} run(s) over ${entries.length} entry(ies)`);
  if (limit !== undefined) console.log(`Partial run: --limit ${limit} mutants.`);
  const calls = 2 * (picked.length + clean.length);
  if (dryRun) {
    console.log(
      `Dry run: would make ${calls} calls, concurrency ${concurrency} samples. No model called.`,
    );
    return exitCode(true);
  }

  type Job = { sample: Sample; entry: AnyWalkthroughEntry; material: ReviewMaterial };
  const jobs: Job[] = [
    ...picked.map((m) => ({
      sample: { id: m.id, kind: 'mutant' as const, group: m.kind },
      entry: m.entry,
      material: m.material,
    })),
    ...clean.map((e, i) => ({
      sample: { id: `${e.id}:clean:${i + 1}`, kind: 'clean' as const, group: 'clean' },
      entry: e,
      material: buildReviewMaterial(e, LOCALE),
    })),
  ];
  let done = 0;
  const outcomes = await pool(jobs, concurrency, async (job): Promise<Outcome> => {
    const r = await panelOf(job.entry, job.material);
    if (++done % 10 === 0) console.error(`  ${done}/${jobs.length}`);
    const pass = (i: 0 | 1) => {
      const review = r.outcomes[i].review;
      return review === null ? null : reviewPasses(review);
    };
    return { sample: job.sample, verdict: r.verdict, passes: [pass(0), pass(1)] };
  });

  const report = score(outcomes, { partial: limit !== undefined });
  console.log(`\n${formatReport(report)}`);
  return exitCode(true, report);
}

async function reviewOne(
  entry: AnyWalkthroughEntry,
  dryRun: boolean,
  panelOf: (e: AnyWalkthroughEntry, m: ReviewMaterial) => Promise<PanelResult>,
): Promise<number> {
  const material = buildReviewMaterial(entry, LOCALE);
  console.log(
    `Entry: ${entry.id}@${entry.entryRev} (${material.frames.length} frames over ${material.presets.length} presets, prompt ${buildReviewPrompt(material).length} chars)`,
  );
  if (dryRun) {
    console.log('Dry run: would make 2 calls. No model called, no file written.');
    return exitCode(true);
  }
  const { verdict, outcomes } = await panelOf(entry, material);
  for (const o of outcomes) if (!o.review) console.error(`Review unusable: ${o.error}`);
  const [a, b] = outcomes.map((o) => o.review);
  for (const r of [a, b]) {
    if (!r) continue;
    console.log(
      `${r.reviewer} (${r.model}): ${JSON.stringify(r.scores)} factErrors=${r.factErrors.length} issues=${r.issues.length}`,
    );
  }
  if (!a || !b) {
    console.log('RESULT: FAIL (a review is missing; nothing written)');
    return 1;
  }
  // Server-side only: node:crypto (hash). Imported late, like the LLM stack.
  const { entryContentHash } = await import('@/lib/tutor/catalog/hash');
  const file = join(
    getCurrentDir(),
    '..',
    '..',
    reviewPath(entry.subject, entry.id, entry.entryRev),
  );
  mkdirSync(dirname(file), { recursive: true });
  const body = {
    entryId: entry.id,
    entryRev: entry.entryRev,
    contentHash: entryContentHash(entry),
    locale: LOCALE,
    verdict,
    reviews: [a, b],
  };
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  console.log(`Wrote ${reviewPath(entry.subject, entry.id, entry.entryRev)}`);
  console.log(`RESULT: ${verdict.toUpperCase()}`);
  return verdict === 'pass' ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
    process.exit(2);
  },
);
