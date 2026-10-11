/**
 * Quiz Grading API
 *
 * POST: Receives a text question + user answer, calls LLM for scoring and feedback.
 * Used for short-answer (text) questions that cannot be graded locally.
 * A failed model call, a failed input filter or a reply without a usable score answers 503
 * GRADING_UNAVAILABLE with no score, so the client keeps the question ungraded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { isTutorModerationEnabled } from '@/lib/config/feature-flags';
import { screenText } from '@/lib/tutor/chat-moderation';
import { moderate, type ModerationVerdict } from '@/lib/tutor/moderation';
const log = createLogger('Quiz Grade');

interface GradeRequest {
  question: string;
  userAnswer: string;
  points: number;
  commentPrompt?: string;
  language?: string;
}

interface GradeResponse {
  score: number;
  comment: string;
}

/** Plain decimal text such as "3". Number() alone reads "" as 0 and "0x3" as 3. */
const DECIMAL_TEXT = /^\s*\d+(?:\.\d+)?\s*$/;

/**
 * Reads the grade from a model reply. Null unless the reply holds a JSON object whose score is a
 * finite number, or decimal text of one, within 0..points. A missing, non-numeric or out-of-range
 * score is never a grade.
 */
function parseGrade(text: string, points: number): GradeResponse | null {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  let parsed: { score?: unknown; comment?: unknown };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
  const { score, comment } = parsed;
  const value = typeof score === 'string' && DECIMAL_TEXT.test(score) ? Number(score) : score;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > points) {
    return null;
  }
  return {
    score: Math.min(points, Math.round(value)),
    comment: typeof comment === 'string' ? comment : '',
  };
}

/** 503 with no score, so the client keeps the question ungraded. */
function gradingUnavailable(): NextResponse {
  return apiError(
    'GRADING_UNAVAILABLE',
    503,
    'Dịch vụ chấm điểm tạm thời không khả dụng, vui lòng thử lại sau.',
  );
}

export async function POST(req: NextRequest) {
  let questionSnippet: string | undefined;
  let resolvedPoints: number | undefined;
  try {
    const body = (await req.json()) as GradeRequest;
    const { question, userAnswer, points, commentPrompt, language } = body;
    if (
      typeof question !== 'string' ||
      typeof userAnswer !== 'string' ||
      !question ||
      !userAnswer
    ) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'question and userAnswer are required');
    }
    questionSnippet = question.substring(0, 60);
    resolvedPoints = points;

    // Validate points is a positive finite number
    if (!points || !Number.isFinite(points) || points <= 0) {
      return apiError('INVALID_REQUEST', 400, 'points must be a positive number');
    }

    // Tutor content filter (ADR 0014): the student's free-text answer goes in, the feedback comes out.
    const moderated = isTutorModerationEnabled();
    if (moderated) {
      // screenText replies to a filter error like a block, so the verdict is kept here.
      const verdicts: ModerationVerdict[] = [];
      const blockedIn = await screenText(userAnswer, 'in', language, {
        moderate: async (text, ctx) => {
          const verdict = await moderate(text, ctx);
          verdicts.push(verdict);
          return verdict;
        },
      });
      // No verdict means the filter threw; an error verdict is its fail-closed marker. Neither is a
      // block: the question stays ungraded instead of getting a score of 0.
      const [verdict] = verdicts;
      if (!verdict || verdict.error) {
        log.error(
          `Quiz grading content filter failed [question="${questionSnippet ?? 'unknown'}..."]`,
        );
        return gradingUnavailable();
      }
      if (blockedIn) return apiSuccess({ score: 0, comment: blockedIn });
    }

    // Resolve model from request headers/body
    const {
      model: languageModel,
      thinkingConfig,
      serverManaged,
    } = await resolveModelFromRequest(req, body, 'quiz-grade');

    const isZh = language === 'zh-CN';

    const systemPrompt = isZh
      ? `你是一位专业的教育评估专家。请根据题目和学生答案进行评分并给出简短评语。
必须以如下 JSON 格式回复（不要包含其他内容）：
{"score": <0到${points}的整数>, "comment": "<一两句评语>"}`
      : `You are a professional educational assessor. Grade the student's answer and provide brief feedback.
You must reply in the following JSON format only (no other content):
{"score": <integer from 0 to ${points}>, "comment": "<one or two sentences of feedback>"}`;

    const userPrompt = isZh
      ? `题目：${question}
满分：${points}分
${commentPrompt ? `评分要点：${commentPrompt}\n` : ''}学生答案：${userAnswer}`
      : `Question: ${question}
Full marks: ${points} points
${commentPrompt ? `Grading guidance: ${commentPrompt}\n` : ''}Student answer: ${userAnswer}`;

    // No fallback grade: a failed call or an unusable reply answers 503.
    let gradeResult: GradeResponse | null;
    try {
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
        },
        'quiz-grade',
        undefined,
        thinkingConfig,
        { serverManaged },
      );
      gradeResult = parseGrade(result.text.trim(), points);
    } catch (error) {
      log.error(
        `Quiz grading AI call failed [question="${questionSnippet ?? 'unknown'}..."]:`,
        error,
      );
      return gradingUnavailable();
    }
    if (!gradeResult) {
      // The reply itself is not logged: it can echo the student's answer.
      log.error(
        `Quiz grading reply has no valid score [question="${questionSnippet ?? 'unknown'}..."]`,
      );
      return gradingUnavailable();
    }

    if (moderated && gradeResult.comment) {
      const blockedOut = await screenText(gradeResult.comment, 'out', language);
      if (blockedOut) gradeResult.comment = blockedOut;
    }

    return apiSuccess({ ...gradeResult });
  } catch (error) {
    log.error(
      `Quiz grading failed [question="${questionSnippet ?? 'unknown'}...", points=${resolvedPoints ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, 'Failed to grade answer');
  }
}
