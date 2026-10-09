/**
 * Review-panel runner (INTERFACES 8.2, ADR 0014 decisions 3, 7, 8).
 *
 * Review one entry with the two panel models and store the result:
 *   pnpm exec tsx eval/tutor-review/runner.ts <entryId> [--dry-run]
 * Calibrate the panel on seeded errors and known-good variants:
 *   pnpm exec tsx eval/tutor-review/runner.ts --calibrate [<entryId>] [--dry-run] [--limit N] [--clean-runs N]
 *
 * Both stages need a MODEL_ROUTES entry, e.g.
 *   MODEL_ROUTES='{"tutor-review-cp":"<provider:model>","tutor-review-cp-2":"<provider:model>"}'
 * on two different providers (a panel on one provider is refused, see --allow-same-provider).
 *
 * --dry-run             print the plan (counts, route status, prompt sizes); no model call, no file written
 * --calibrate           seeded-error calibration: catch >= 90% of mutants, false-block <= 10% of the clean
 *                       set; never writes a review file
 * --limit N             N mutants, spread evenly (default: all non-equivalent mutants)
 * --clean-runs N        use only the first N clean variants (default: all; N < 10 makes the run partial)
 * --concurrency         parallel samples (default 2; each sample makes two model calls)
 * --allow-same-provider dev/test only: accept two reviewers on the same provider (default: refuse)
 *
 * CLEAN SET. The catalog is small, so the clean set is the real entries plus deterministic,
 * semantics-preserving rewrites of their data (clean-variants.ts): DISTINCT VARIANTS, never plain
 * repeats. They are not independent entries: independent, human-verified entries are still
 * preferable, and the false-block rate measured here is only as good as that set. Fewer than 10
 * distinct clean variants -> exit 2. Every review shows both locales side by side; the primary
 * locale alternates (vi-VN, en-US) over the clean variants.
 *
 * A failed model call or unparseable review makes its sample UNUSABLE: reported, excluded from
 * the catch and false-block rates, the run continues; more than 10% unusable samples -> exit 1.
 *
 * A real review writes lib/subjects/<subject>/reviews/<entryId>@<entryRev>.json.
 * Exit code: 0 pass, 1 target missed or review failed, 2 cannot run (no route, bad args or entry,
 * too few distinct clean variants, a panel on one provider).
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
  buildReviewSystem,
  providerOf,
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
import { cleanVariants, fingerprint } from './clean-variants';
import { MIN_CLEAN, exitCode, formatReport, score } from './score';
import type { Outcome, Sample } from './score';
import { seedErrors } from './seed-errors';

/** Panel stages per subject (LLM_STAGES). */
const PANELS: Readonly<Record<string, readonly [LlmStage, LlmStage]>> = {
  cp: ['tutor-review-cp', 'tutor-review-cp-2'],
  math: ['tutor-review-math', 'tutor-review-math-2'],
};
const LOCALE = 'vi-VN';
/** Primary locale of the clean variants, alternating; the other locale is always shown side by side. */
const CLEAN_LOCALES = ['vi-VN', 'en-US'] as const;

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
      'clean-runs': { type: 'string' },
      concurrency: { type: 'string', default: '2' },
      'allow-same-provider': { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  const concurrency = positiveInt('concurrency', values.concurrency);
  const cleanRuns =
    values['clean-runs'] === undefined
      ? undefined
      : positiveInt('clean-runs', values['clean-runs']);
  const allowSameProvider = values['allow-same-provider'];
  const limit = values.limit === undefined ? undefined : positiveInt('limit', values.limit);
  const calibrate = values.calibrate;
  const dryRun = values['dry-run'];
  if (positionals.length > 1) throw new Error('at most one <entryId>');
  if (!calibrate && positionals.length === 0) throw new Error('give an <entryId> or --calibrate');
  if (!calibrate && (limit !== undefined || cleanRuns !== undefined)) {
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

  // A panel on one provider is not independent (ADR 0014 decision 8): refuse, as the verdict would.
  if (!allowSameProvider) {
    const same = [...routes].filter(([, [a, b]]) => {
      const p = providerOf(a.model);
      return p !== null && p === providerOf(b.model);
    });
    if (same.length > 0) {
      console.error(
        `Both reviewers of ${same.map(([s]) => s).join(', ')} are on one provider. Use two providers (or --allow-same-provider for dev/test).`,
      );
      return exitCode(false);
    }
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
        temperature: REVIEW_TEMPERATURE,
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
  const panelOf = (e: AnyWalkthroughEntry, material: ReviewMaterial): Promise<PanelResult> =>
    reviewPanel(
      material,
      stagesOf(e.subject),
      routes.get(e.subject)!,
      llm,
      Number(process.env.TUTOR_REVIEW_TIMEOUT_MS) || undefined,
      {
        allowSameProvider,
      },
    );

  if (!calibrate) return reviewOne(entries[0], dryRun, panelOf);

  // --- calibration ---
  const mutants = entries.flatMap((e) => seedErrors(e, LOCALE));
  const picked = limit === undefined ? mutants : spread(mutants, limit);
  const variants = cleanVariants(entries);
  const distinct = new Set(variants.map((v) => fingerprint(v.entry))).size;
  if (distinct < MIN_CLEAN) {
    console.error(
      `Only ${distinct} distinct clean variant(s) (need >= ${MIN_CLEAN}); a calibration needs a real clean set.`,
    );
    return 2;
  }
  const clean = variants.slice(0, cleanRuns ?? variants.length);
  const partial = limit !== undefined || clean.length < MIN_CLEAN;
  console.log(
    `Seeded errors: ${picked.length} of ${mutants.length} non-equivalent (${countBy(picked.map((m) => m.kind))})`,
  );
  console.log(
    `Clean set:     ${clean.length} distinct variant(s) of ${entries.length} entry(ies), ${clean.filter((v) => v.ops.length === 0).length} real; reviewed alternately with ${CLEAN_LOCALES.join(' / ')} first, both locales shown.`,
  );
  console.log(
    'Note: the clean set is only DISTINCT VARIANTS (rewrites of the real entries), not independent entries; independent human-verified entries are still preferable.',
  );
  if (partial) console.log('Partial run: the size minimums are not required.');

  type Job = { sample: Sample; entry: AnyWalkthroughEntry; material: ReviewMaterial };
  const jobs: Job[] = [
    ...picked.map((m) => ({
      sample: { id: m.id, kind: 'mutant' as const, group: m.kind },
      entry: m.entry,
      material: m.material,
    })),
    ...clean.map((v, i) => ({
      sample: { id: `${v.id}:clean`, kind: 'clean' as const, group: 'clean' },
      entry: v.entry,
      material: buildReviewMaterial(v.entry, CLEAN_LOCALES[i % CLEAN_LOCALES.length]),
    })),
  ];
  // Prompt sizes (chars): what one call sends; too big a prompt cannot run.
  const sizes: number[] = [];
  let tooBig = 0;
  for (const j of jobs) {
    try {
      sizes.push(buildReviewPrompt(j.material).length);
    } catch (e) {
      tooBig++;
      console.error(`${j.sample.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (sizes.length > 0) {
    const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
    console.log(
      `Prompt size:   min ${Math.min(...sizes)}, avg ${avg}, max ${Math.max(...sizes)} chars (+ system ${buildReviewSystem('r', 'm', jobs[0].material).length})`,
    );
  }
  if (tooBig > 0) return 2;
  const calls = 2 * jobs.length;
  if (dryRun) {
    console.log(
      `Dry run: would make ${calls} calls, concurrency ${concurrency} samples. No model called.`,
    );
    return exitCode(true);
  }

  let done = 0;
  const outcomes = await pool(jobs, concurrency, async (job): Promise<Outcome> => {
    let r: PanelResult | null = null;
    try {
      r = await panelOf(job.entry, job.material);
    } catch (e) {
      // reviewPanel never throws; a failure here is one unusable sample, not the end of the run
      console.error(`${job.sample.id}: ${e instanceof Error ? e.message : e}`);
    }
    if (++done % 10 === 0) console.error(`  ${done}/${jobs.length}`);
    const pass = (i: 0 | 1) => {
      const review = r?.outcomes[i].review ?? null;
      return review === null ? null : reviewPasses(review);
    };
    return { sample: job.sample, verdict: r?.verdict ?? 'fail', passes: [pass(0), pass(1)] };
  });

  const report = score(outcomes, { partial });
  console.log(`\n${formatReport(report)}`);
  return exitCode(true, report);
}

/** Reasoning reviewers spend most of the budget thinking; raise it with TUTOR_REVIEW_MAX_OUTPUT_TOKENS (default 4000); slow ones also need TUTOR_REVIEW_TIMEOUT_MS (default 180000). */
const REVIEW_MAX_OUTPUT_TOKENS = Number(process.env.TUTOR_REVIEW_MAX_OUTPUT_TOKENS) || 4000;
/** 0 by default; a provider that rejects 0 (longcat wants at least 0.1) needs TUTOR_REVIEW_TEMPERATURE=0.1. */
const REVIEW_TEMPERATURE = Number(process.env.TUTOR_REVIEW_TEMPERATURE) || 0;

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
