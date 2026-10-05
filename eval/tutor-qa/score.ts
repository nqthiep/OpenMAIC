// Pure scoring for eval:tutor-qa (TEST-STRATEGY section 6). No I/O, no model calls:
// the runner feeds it one outcome per (scenario, arm).

/** Targets as whole percents; compared with integer math (no float error). */
export const MIN_CORRECT_PCT = 100;
export const MIN_ON_FRAME_PCT = 90;
export const MIN_HINT_FIRST_PCT = 80;
export const MIN_SCENARIOS = 20;

export const ARMS = ['control', 'treatment'] as const;
/** control: static digest only. treatment: `describeWalkthrough` with the frame from `widgetState`. */
export type Arm = (typeof ARMS)[number];

export interface Scenario {
  id: string;
  presetId: string;
  /** 0-based frame index, as in `WidgetRuntimeState.frame`. */
  frame: number;
  question: string;
  /** What must hold in a correct answer, derived from the frame's true state. */
  expectedFacts: string[];
  /** `<beatId>#<index>` into the catalog's `beatDefs[].misconceptions`. */
  misconceptionId?: string;
  /** The student asks for the answer outright: "hint first" is not required. */
  fullAnswerRequested?: boolean;
}

export interface ScenarioFile {
  entryId: string;
  locale: string;
  scenarios: Scenario[];
}

/** The judge's verdict on one answer. `null` = metric not applicable to the scenario. */
export interface Verdict {
  /** Consistent with `expectedFacts`, no false claim. */
  correct: boolean;
  /** Refers to the current frame's values. */
  onFrame: boolean;
  /** Does not lead with the full answer. null when the student asked for it. */
  hintFirst: boolean | null;
  /** Names the known misconception and gives a counterexample. null without `misconceptionId`. */
  usesMisconception: boolean | null;
  reason: string;
}

/** `verdict` is null when the answer or the judge failed (counts as a miss). */
export interface Outcome {
  scenario: Scenario;
  arm: Arm;
  verdict: Verdict | null;
  error?: string;
}

export interface Tally {
  pass: number;
  total: number;
}

export interface ArmReport {
  arm: Arm;
  correct: Tally;
  onFrame: Tally;
  hintFirst: Tally;
  /** Tracked only, no threshold (TEST-STRATEGY section 6). */
  misconception: Tally;
  failures: number;
  /** `[frameKey, correct tally]`, frameKey = `presetId@frame`. */
  byFrame: [string, Tally][];
  wrong: string[];
}

export interface Report {
  control: ArmReport;
  treatment: ArmReport;
  partial: boolean;
  undersized: boolean;
  correctOk: boolean;
  onFrameOk: boolean;
  hintFirstOk: boolean;
  /** The treatment arm meets all three targets (the control arm is the baseline only). */
  ok: boolean;
}

function fail(at: string, msg: string): never {
  throw new Error(`${at}: ${msg}`);
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Strict parse of scenarios.json; throws on the first problem. */
export function parseScenarios(raw: string): ScenarioFile {
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fail('scenarios', 'invalid JSON');
  }
  if (!isStr(v.entryId) || !isStr(v.locale) || !Array.isArray(v.scenarios)) {
    return fail('scenarios', 'entryId, locale (strings) and scenarios (array) are required');
  }
  const ids = new Set<string>();
  for (const [i, s] of (v.scenarios as Record<string, unknown>[]).entries()) {
    const at = `scenarios[${i}]`;
    if (!isStr(s.id) || ids.has(s.id)) fail(at, 'id must be a unique non-empty string');
    ids.add(s.id);
    if (!isStr(s.presetId) || !isStr(s.question)) fail(at, 'presetId and question are required');
    if (!Number.isInteger(s.frame) || (s.frame as number) < 0)
      fail(at, 'frame must be an integer >= 0');
    if (
      !Array.isArray(s.expectedFacts) ||
      s.expectedFacts.length === 0 ||
      !s.expectedFacts.every(isStr)
    ) {
      fail(at, 'expectedFacts must be a non-empty array of strings');
    }
    if (s.misconceptionId !== undefined && !isStr(s.misconceptionId))
      fail(at, 'bad misconceptionId');
    if (s.fullAnswerRequested !== undefined && typeof s.fullAnswerRequested !== 'boolean') {
      fail(at, 'fullAnswerRequested must be a boolean');
    }
  }
  return v as unknown as ScenarioFile;
}

/** `n` items spread evenly over the list (all of them if `n` >= length). */
export function spread<T>(items: readonly T[], n: number): T[] {
  if (n >= items.length) return [...items];
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);
}

/** Whole-percent target met; an empty denominator cannot show it. */
export const meets = (t: Tally, minPct: number): boolean =>
  t.total > 0 && t.pass * 100 >= t.total * minPct;

function armReport(arm: Arm, outcomes: readonly Outcome[]): ArmReport {
  const r: ArmReport = {
    arm,
    correct: { pass: 0, total: 0 },
    onFrame: { pass: 0, total: 0 },
    hintFirst: { pass: 0, total: 0 },
    misconception: { pass: 0, total: 0 },
    failures: 0,
    byFrame: [],
    wrong: [],
  };
  const frames = new Map<string, Tally>();
  const count = (t: Tally, applicable: boolean, ok: boolean | null | undefined) => {
    if (!applicable) return;
    t.total++;
    if (ok === true) t.pass++;
  };
  for (const o of outcomes.filter((x) => x.arm === arm)) {
    const { scenario: s, verdict: v } = o;
    if (!v) r.failures++;
    count(r.correct, true, v?.correct);
    count(r.onFrame, true, v?.onFrame);
    count(r.hintFirst, !s.fullAnswerRequested, v?.hintFirst);
    count(r.misconception, s.misconceptionId !== undefined, v?.usesMisconception);
    const key = `${s.presetId}@${s.frame}`;
    const f = frames.get(key) ?? { pass: 0, total: 0 };
    frames.set(key, f);
    count(f, true, v?.correct);
    if (!v?.correct) r.wrong.push(s.id);
  }
  r.byFrame = [...frames];
  return r;
}

export function score(outcomes: readonly Outcome[], opts: { partial?: boolean } = {}): Report {
  const control = armReport('control', outcomes);
  const treatment = armReport('treatment', outcomes);
  const correctOk = meets(treatment.correct, MIN_CORRECT_PCT);
  const onFrameOk = meets(treatment.onFrame, MIN_ON_FRAME_PCT);
  const hintFirstOk = meets(treatment.hintFirst, MIN_HINT_FIRST_PCT);
  const partial = opts.partial ?? false;
  const undersized = treatment.correct.total < MIN_SCENARIOS;
  return {
    control,
    treatment,
    partial,
    undersized,
    correctOk,
    onFrameOk,
    hintFirstOk,
    // A --limit run cannot claim the target; neither can a set below the minimum.
    ok: correctOk && onFrameOk && hintFirstOk && !partial && !undersized,
  };
}

/** 2 = cannot run (no route, bad input), 1 = target missed, 0 = ok. Without a report: plan only. */
export function exitCode(routeOk: boolean, report?: Report): 0 | 1 | 2 {
  if (!routeOk) return 2;
  if (!report) return 0;
  return report.ok ? 0 : 1;
}

const pct = (t: Tally) => (t.total === 0 ? 'n/a' : `${((100 * t.pass) / t.total).toFixed(1)}%`);
const cell = (t: Tally) => `${t.pass}/${t.total} ${pct(t)}`.padEnd(16);

export function formatReport(r: Report): string {
  const lines = [
    'Arm        Dung            Bam frame       Goi y truoc     Dung hieu lam (theo doi)',
  ];
  for (const a of [r.control, r.treatment]) {
    lines.push(
      `${a.arm.padEnd(10)} ${cell(a.correct)}${cell(a.onFrame)}${cell(a.hintFirst)}${cell(a.misconception)}`,
    );
  }
  lines.push('', 'Correct by frame (treatment):');
  for (const [key, t] of r.treatment.byFrame) lines.push(`  ${key.padEnd(14)} ${cell(t)}`);
  const status = (ok: boolean) => (ok ? 'PASS' : 'FAIL');
  const t = r.treatment;
  lines.push(
    '',
    `Dung (treatment):         ${cell(t.correct)}(target ${MIN_CORRECT_PCT}%) ${status(r.correctOk)}`,
    `Bam frame (treatment):    ${cell(t.onFrame)}(target >= ${MIN_ON_FRAME_PCT}%) ${status(r.onFrameOk)}`,
    `Goi y truoc (treatment):  ${cell(t.hintFirst)}(target >= ${MIN_HINT_FIRST_PCT}%) ${status(r.hintFirstOk)}`,
  );
  for (const a of [r.control, r.treatment]) {
    if (a.failures > 0) {
      lines.push(
        `WARNING: ${a.failures} ${a.arm} call(s) failed or gave an unusable verdict (counted as misses).`,
      );
    }
  }
  if (r.treatment.wrong.length > 0)
    lines.push(`Not correct (treatment): ${r.treatment.wrong.join(', ')}`);
  if (r.partial) lines.push('Partial run (--limit): the target cannot be claimed.');
  if (r.undersized) lines.push(`Set too small: need >= ${MIN_SCENARIOS} scenarios.`);
  lines.push('', r.ok ? 'RESULT: PASS' : 'RESULT: FAIL');
  return lines.join('\n');
}
