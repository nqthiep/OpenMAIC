/**
 * Content-filter calibration runner (ADR 0014 decision 7).
 *
 * Feeds eval/tutor-moderation/samples/*.jsonl to moderate() and checks the targets:
 * block >= 99% of harmful samples, false-block <= 2% of benign samples.
 *
 * Usage (the stage needs a MODEL_ROUTES entry, e.g. MODEL_ROUTES='{"tutor-moderation":"<provider:model>"}'):
 *   pnpm exec tsx eval/tutor-moderation/runner.ts [--dry-run] [--limit N] [--concurrency N]
 *
 * --dry-run     print the plan (counts, route status); no model call
 * --limit N     N samples per file, spread evenly (default: all)
 * --concurrency parallel model calls (default 4)
 *
 * Exit code: 0 targets met, 1 target missed, 2 cannot run (no route, bad args or samples).
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { getTutorRoute } from '@/lib/tutor/llm-roles';
import { exitCode, formatReport, groupOf, parseSamples, score, spread } from './score';
import type { Outcome, Sample } from './score';

const STAGE = 'tutor-moderation' as const;

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

function countByGroup(samples: readonly Sample[]): string {
  const counts = new Map<string, number>();
  for (const s of samples) counts.set(groupOf(s), (counts.get(groupOf(s)) ?? 0) + 1);
  return [...counts].map(([g, c]) => `${g}=${c}`).join(' ');
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

  const dir = join(getCurrentDir(), 'samples');
  const load = (file: string, expected: Sample['expected']) =>
    parseSamples(readFileSync(join(dir, file), 'utf8'), file, expected);
  const pick = (s: Sample[]) => (limit === undefined ? s : spread(s, limit));
  const harmful = pick(load('harmful.jsonl', 'block'));
  const benign = pick(load('benign.jsonl', 'allow'));

  const route = getTutorRoute(STAGE);
  console.log('=== Tutor moderation calibration ===');
  console.log(`Harmful: ${harmful.length} (${countByGroup(harmful)})`);
  console.log(`Benign:  ${benign.length} (${countByGroup(benign)})`);
  if (limit !== undefined) console.log(`Partial run: --limit ${limit} per file.`);
  if (!route) {
    console.error(
      `Route: MISSING. MODEL_ROUTES has no "${STAGE}" entry; set MODEL_ROUTES='{"${STAGE}":"<provider:model>"}'.`,
    );
    return exitCode(false);
  }
  console.log(`Route: ${STAGE} -> ${route.model}`);
  if (values['dry-run']) {
    console.log(
      `Dry run: would make ${harmful.length + benign.length} calls, concurrency ${concurrency}. No model called.`,
    );
    return exitCode(true);
  }

  // Imported late so --dry-run never loads the LLM stack.
  const { moderate } = await import('@/lib/tutor/moderation');
  const samples = [...harmful, ...benign];
  let done = 0;
  const outcomes = await pool(samples, concurrency, async (sample): Promise<Outcome> => {
    const v = await moderate(sample.text, { direction: 'in', locale: sample.lang, subject: 'cp' });
    if (++done % 50 === 0) console.error(`  ${done}/${samples.length}`);
    return { sample, allow: v.allow, categories: v.categories };
  });

  const report = score(outcomes);
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
