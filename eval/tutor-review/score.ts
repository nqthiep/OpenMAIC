// Pure scoring for the review-panel calibration (ADR 0014 decision 7).
// No I/O, no model calls: the runner feeds it one outcome per sample.

/** Targets as whole percents; compared with integer math (no float error). */
export const MIN_CATCH_PCT = 90;
export const MAX_FALSE_BLOCK_PCT = 10;
/** Calibration set size (ADR 0014 decision 7): >= 30 seeded entries and >= 10 valid ones. */
export const MIN_MUTANTS = 30;
export const MIN_CLEAN = 10;
/** More than this share of samples with an unusable review (call failed, late, malformed) fails the run. */
export const MAX_UNUSABLE_PCT = 10;

export interface Sample {
  id: string;
  /** `mutant` carries one planted error and must fail; `clean` is unmodified and must pass. */
  kind: 'mutant' | 'clean';
  /** Seed kind for a mutant; 'clean' otherwise. */
  group: string;
}

/**
 * What the panel said about one sample. `passes[i]` is reviewer i's own verdict, or null when it
 * gave no usable review (call failed, late or malformed). A sample with a null is UNUSABLE: it is
 * reported and left out of the catch and false-block rates (it neither catches nor blocks).
 */
export interface Outcome {
  sample: Sample;
  verdict: 'pass' | 'fail';
  passes: readonly [boolean | null, boolean | null];
}

/** A failed model call or unparseable review in either seat. */
export const isUnusable = (o: Outcome): boolean => o.passes[0] === null || o.passes[1] === null;

export interface Wrong {
  id: string;
  group: string;
}

export interface GroupRow {
  group: string;
  total: number;
  /** mutant: missed (passed). clean: blocked (failed). */
  wrong: number;
}

/** Catch/false-block counts of one verdict source (the panel, or one reviewer alone). */
export interface Rates {
  mutants: number;
  caught: number;
  clean: number;
  falseBlocked: number;
  catchOk: boolean;
  falseBlockOk: boolean;
}

export interface Report {
  panel: Rates;
  /** Reviewers alone; a null review counts as a fail. */
  reviewers: readonly [Rates, Rates];
  rows: GroupRow[];
  missed: Wrong[];
  falseBlocks: Wrong[];
  /** Reviews that could not be used (null), summed over both reviewers. */
  noReview: number;
  /** Samples with an unusable review: excluded from every rate above. */
  unusable: Wrong[];
  /** Samples run, usable or not. */
  total: number;
  unusableOk: boolean;
  /** Counted on usable samples only. */
  undersized: boolean;
  /**
   * Panel meets both targets, reviewer 1 alone meets both (ADR 0014 d8), at most MAX_UNUSABLE_PCT
   * of the samples were unusable, and the (usable) set is big enough.
   */
  ok: boolean;
}

function rates(
  outcomes: readonly Outcome[],
  failed: (o: Outcome) => boolean,
  usable: (o: Outcome) => boolean,
): Rates {
  let mutants = 0;
  let caught = 0;
  let clean = 0;
  let falseBlocked = 0;
  for (const o of outcomes) {
    if (!usable(o)) continue;
    if (o.sample.kind === 'mutant') {
      mutants++;
      if (failed(o)) caught++;
    } else {
      clean++;
      if (failed(o)) falseBlocked++;
    }
  }
  // An empty side cannot show it meets its target.
  return {
    mutants,
    caught,
    clean,
    falseBlocked,
    catchOk: mutants > 0 && caught * 100 >= mutants * MIN_CATCH_PCT,
    falseBlockOk: clean > 0 && falseBlocked * 100 <= clean * MAX_FALSE_BLOCK_PCT,
  };
}

/** `partial`: a --limit run; the calibration size minimums are then not required. */
export function score(outcomes: readonly Outcome[], opts: { partial?: boolean } = {}): Report {
  const panel = rates(
    outcomes,
    (o) => o.verdict === 'fail',
    (o) => !isUnusable(o),
  );
  const r1 = rates(
    outcomes,
    (o) => o.passes[0] !== true,
    (o) => o.passes[0] !== null,
  );
  const r2 = rates(
    outcomes,
    (o) => o.passes[1] !== true,
    (o) => o.passes[1] !== null,
  );

  const rows = new Map<string, GroupRow>();
  const missed: Wrong[] = [];
  const falseBlocks: Wrong[] = [];
  const unusable: Wrong[] = [];
  let noReview = 0;
  for (const o of outcomes) {
    const { id, group, kind } = o.sample;
    noReview += o.passes.filter((p) => p === null).length;
    if (isUnusable(o)) {
      unusable.push({ id, group });
      continue;
    }
    const row = rows.get(group) ?? { group, total: 0, wrong: 0 };
    rows.set(group, row);
    row.total++;
    if (kind === 'mutant' && o.verdict === 'pass') {
      row.wrong++;
      missed.push({ id, group });
    } else if (kind === 'clean' && o.verdict === 'fail') {
      row.wrong++;
      falseBlocks.push({ id, group });
    }
  }
  const unusableOk = unusable.length * 100 <= outcomes.length * MAX_UNUSABLE_PCT;
  const undersized = !opts.partial && (panel.mutants < MIN_MUTANTS || panel.clean < MIN_CLEAN);
  const gate = (r: Rates) => r.catchOk && r.falseBlockOk;
  return {
    panel,
    reviewers: [r1, r2],
    rows: [...rows.values()].sort((a, b) => a.group.localeCompare(b.group)),
    missed,
    falseBlocks,
    noReview,
    unusable,
    total: outcomes.length,
    unusableOk,
    undersized,
    ok: gate(panel) && gate(r1) && unusableOk && !undersized,
  };
}

/** 2 = cannot run (no route, bad input), 1 = target missed or review failed, 0 = ok. Without a report: plan only. */
export function exitCode(routeOk: boolean, report?: Report): 0 | 1 | 2 {
  if (!routeOk) return 2;
  if (!report) return 0;
  return report.ok ? 0 : 1;
}

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(2)}%`);
const verdict = (ok: boolean) => (ok ? 'PASS' : 'FAIL');

export function formatReport(r: Report): string {
  const lines = ['Group                Total  Wrong  Wrong%'];
  for (const row of r.rows) {
    lines.push(
      `${row.group.padEnd(20)} ${String(row.total).padStart(5)}  ${String(row.wrong).padStart(5)}  ${pct(row.wrong, row.total)}`,
    );
  }
  const line = (name: string, x: Rates) =>
    `${name.padEnd(11)} catch ${x.caught}/${x.mutants} = ${pct(x.caught, x.mutants)} (target >= ${MIN_CATCH_PCT}%) ${verdict(x.catchOk)}; false-block ${x.falseBlocked}/${x.clean} = ${pct(x.falseBlocked, x.clean)} (target <= ${MAX_FALSE_BLOCK_PCT}%) ${verdict(x.falseBlockOk)}`;
  lines.push(
    '',
    line('Panel', r.panel),
    line('Reviewer 1', r.reviewers[0]) + '  [gated: ADR 0014 d8]',
    line('Reviewer 2', r.reviewers[1]) + '  [reported only]',
  );
  if (r.unusable.length > 0) {
    lines.push(
      `Unusable: ${r.unusable.length}/${r.total} sample(s) = ${pct(r.unusable.length, r.total)} (${r.noReview} review(s) failed: error, timeout or malformed), excluded from every rate above; limit ${MAX_UNUSABLE_PCT}% ${verdict(r.unusableOk)}`,
    );
  }
  if (r.undersized) {
    lines.push(
      `WARNING: set too small (need >= ${MIN_MUTANTS} seeded and >= ${MIN_CLEAN} unmodified samples).`,
    );
  }
  const list = (title: string, wrong: Wrong[]) => {
    if (wrong.length === 0) return;
    lines.push('', `${title} (${wrong.length}):`);
    for (const w of wrong) lines.push(`  ${w.id}`);
  };
  list('Unusable samples (excluded from the rates)', r.unusable);
  list('Missed seeded errors (panel passed them)', r.missed);
  list('False blocks (unmodified entry failed)', r.falseBlocks);
  lines.push('', r.ok ? 'RESULT: PASS' : 'RESULT: FAIL');
  return lines.join('\n');
}
