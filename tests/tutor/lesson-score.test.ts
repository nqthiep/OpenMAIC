import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildJudgeSystem,
  buildGeneratorSystem,
  CRITERIA,
  coverageProblems,
  exitCode,
  parseScenarios,
  parseVerdict,
  samplePasses,
  score,
  type SampleOutcome,
  type Verdict,
} from '@/eval/tutor-lesson/judge';

const file = parseScenarios(readFileSync('eval/tutor-lesson/scenarios.json', 'utf8'));

const good: Verdict = {
  correct: true,
  factErrors: [],
  clarity: 4.5,
  detail: 4,
  understandable: 4,
  visual: 4,
  lively: 3.5,
  reason: 'ok',
};
const outcome = (i: number, over: Partial<SampleOutcome> = {}): SampleOutcome => ({
  scenario: file.scenarios[0],
  sample: i,
  verdict: good,
  predictOk: true,
  recipeIssues: [],
  ...over,
});
const zero = { inputTokens: 0, outputTokens: 0 };

describe('eval:tutor-lesson scenarios', () => {
  it('cover section 6: >= 6 scenarios, 3 per track, >= 2 exam problems', () => {
    expect(coverageProblems(file.scenarios)).toEqual([]);
  });
});

describe('eval:tutor-lesson verdict', () => {
  it('accepts a well-formed verdict and a fenced one', () => {
    expect(parseVerdict(JSON.stringify(good))).toEqual(good);
    expect(parseVerdict('```json\n' + JSON.stringify(good) + '\n```')).toEqual(good);
  });

  it('rejects extra keys, off-grid scores and a contradictory correct flag', () => {
    expect(parseVerdict(JSON.stringify({ ...good, extra: 1 }))).toBeNull();
    expect(parseVerdict(JSON.stringify({ ...good, clarity: 4.3 }))).toBeNull();
    expect(parseVerdict(JSON.stringify({ ...good, clarity: 6 }))).toBeNull();
    expect(parseVerdict(JSON.stringify({ ...good, factErrors: ['x'] }))).toBeNull();
    expect(parseVerdict('not json')).toBeNull();
  });
});

describe('eval:tutor-lesson scoring', () => {
  it('a sample fails below any threshold, on a fact error or without enough predictions', () => {
    expect(samplePasses(outcome(0))).toBe(true);
    for (const c of CRITERIA) {
      expect(samplePasses(outcome(0, { verdict: { ...good, [c]: 3 } }))).toBe(false);
    }
    expect(samplePasses(outcome(0, { predictOk: false }))).toBe(false);
    expect(samplePasses(outcome(0, { verdict: null, error: 'boom' }))).toBe(false);
  });

  it('with N=3 and a 70% bar, 2 of 3 is not enough', () => {
    const run = (n: number) => ({
      outcomes: [0, 1, 2].map((i) => outcome(i, i < n ? {} : { verdict: { ...good, detail: 2 } })),
      generator: zero,
      judge: zero,
    });
    expect(score(run(3)).scenarios[0].ok).toBe(true);
    expect(score(run(2)).scenarios[0].ok).toBe(false);
  });

  it('a run cannot pass when partial or below the coverage', () => {
    const run = { outcomes: [0, 1, 2].map((i) => outcome(i)), generator: zero, judge: zero };
    expect(score(run).ok).toBe(false); // only one scenario
    expect(exitCode(true, score(run))).toBe(1);
    expect(exitCode(false)).toBe(2);
    expect(exitCode(true)).toBe(0);
  });
});

describe('math scenarios (card 3B-E1)', () => {
  const math = parseScenarios(
    readFileSync(join(process.cwd(), 'eval/tutor-lesson/scenarios-math.json'), 'utf8'),
  );

  it('has at least 3 scenarios, all parse, and the topics are real curriculum ids', () => {
    expect(math.scenarios.length).toBeGreaterThanOrEqual(3);
    const curriculum = readFileSync(
      join(process.cwd(), 'skills/agent-runtime/olympiad-math/references/curriculum/index.json'),
      'utf8',
    );
    for (const s of math.scenarios) expect(curriculum, s.id).toContain(`"${s.topicId}"`);
  });

  it('math prompts talk about mathematics, informatics prompts are unchanged', () => {
    expect(buildGeneratorSystem('vi-VN', 'math')).toContain('olympiad mathematics');
    expect(buildGeneratorSystem('vi-VN', 'math')).not.toContain('brute force');
    expect(buildGeneratorSystem('vi-VN')).toContain('competitive programming');
    expect(buildJudgeSystem('math')).toContain('olympiad mathematics');
    expect(buildJudgeSystem()).toContain('competitive programming');
  });
});
