/**
 * AI pre-grading of a challenge entry against the problem and its reference solution: a score
 * from 0 to 10 and short feedback for the author. Server only; the caller decides who pays.
 */
import { callLLM } from '@/lib/ai/llm';
import { resolveModel } from '@/lib/server/resolve-model';

const SYSTEM_PROMPT = `You grade solutions to a math or science problem for a learning community.
Compare the student's solution with the problem and, when given, the reference solution.
Judge correctness of the result and of the reasoning; a different valid method is fine.
Reply with JSON only: {"score": <integer 0-10>, "feedback": "<2 to 4 sentences>"}.
The feedback speaks to the student, in the language of their solution, says what is right and
what to fix, and does not reveal the reference solution. Write formulas between $...$.`;

export async function gradeEntry(input: {
  statement: string;
  referenceSolution: string;
  body: string;
}): Promise<{ score: number; feedback: string }> {
  const prompt = [
    `Problem:\n${input.statement}`,
    input.referenceSolution ? `Reference solution:\n${input.referenceSolution}` : '',
    `Student solution:\n${input.body}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const model = await resolveModel({});
  const result = await callLLM(
    { model: model.model, system: SYSTEM_PROMPT, prompt },
    'challenge-grade',
    undefined,
    model.thinkingConfig,
  );
  const json = result.text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('No JSON in the grade');
  const parsed = JSON.parse(json) as { score?: unknown; feedback?: unknown };
  const score = Math.round(Number(parsed.score));
  if (!Number.isFinite(score)) throw new Error('No score in the grade');
  return {
    score: Math.max(0, Math.min(10, score)),
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback.trim() : '',
  };
}
