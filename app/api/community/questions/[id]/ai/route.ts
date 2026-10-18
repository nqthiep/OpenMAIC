import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { summarizeElements } from '@/lib/orchestration/summarizers/state-context';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import { requireSpender } from '@/lib/server/authz/viewer';
import { addAnswer, hasAiAnswer, readQuestion } from '@/lib/server/learning/community';
import { readCommunityCourse } from '@/lib/server/learning/community-course';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import { resolveModel } from '@/lib/server/resolve-model';
import type { Scene } from '@/lib/types/stage';

export const runtime = 'nodejs';

const log = createLogger('CommunityAi');

type Params = { params: Promise<{ id: string }> };

const QUESTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Lesson text sent as context. Enough for one scene and its narration. */
const CONTEXT_MAX = 6000;

const SYSTEM_PROMPT = `You are a patient teaching assistant in a learning community.
Answer the learner's question so that a student can follow it step by step.
Use the lesson content when it is relevant, and say so when the question goes beyond it.
Be accurate; when you are not sure, say what you are unsure about instead of guessing.
Do not give away answers to quiz questions in the lesson; explain the idea instead.
Reply in the language of the question. Use Markdown. Write every formula between $...$ (inline)
or $$...$$ (display); never use \\( \\) or \\[ \\].
Keep it under 250 words.`;

/** The words of one scene: what is on it and what the teacher says. Quiz answers are left out. */
function sceneText(scene: Scene): string {
  const lines = [`Scene: ${scene.title}`];
  const content = scene.content as {
    type: string;
    canvas?: { elements: unknown[] };
    questions?: { question: string }[];
  };
  if (content.type === 'slide' && content.canvas) {
    lines.push(`Slide elements:\n${summarizeElements(content.canvas.elements)}`);
  }
  if (content.type === 'quiz' && content.questions) {
    lines.push(
      `Quiz questions:\n${content.questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}`,
    );
  }
  const speech = ((scene as { actions?: { type?: string; text?: unknown }[] }).actions ?? [])
    .filter((action) => action.type === 'speech' && typeof action.text === 'string')
    .map((action) => action.text as string);
  if (speech.length > 0) lines.push(`Teacher narration:\n${speech.join('\n')}`);
  return lines.join('\n');
}

/**
 * Writes the AI answer of a question, once. The asker (or staff) calls it right after asking; the
 * tokens are charged to the caller like any other AI use. A second call returns the existing answer.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'community.read');
      if (refusal) return refusal;
      const question = QUESTION_ID_PATTERN.test(id) ? await readQuestion(ctx.db, id) : undefined;
      if (!question || question.hidden) return apiError('NOT_FOUND', 404, 'No such question.');
      if (question.authorId !== ctx.viewer.accountId && !can(ctx.viewer, 'community.moderate')) {
        return apiError('FORBIDDEN', 403, 'Only the asker requests the AI answer.');
      }
      if (await hasAiAnswer(ctx.db, id)) return apiSuccess({ created: false });
      const denied = await requireSpender(request.headers);
      if (denied) return denied;

      const course = await readCommunityCourse(ctx.db, question.courseId);
      const scene = course?.scenes.find((s) => s.id === question.sceneId);
      const lesson = (scene ? sceneText(scene) : '').slice(0, CONTEXT_MAX);
      const prompt = [
        `Course: ${question.courseTitle}`,
        lesson ? `Lesson content:\n${lesson}` : 'No lesson content is available.',
        `Question title: ${question.title}`,
        question.body ? `Question details:\n${question.body}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      try {
        const model = await resolveModel({});
        const result = await callLLM(
          { model: model.model, system: SYSTEM_PROMPT, prompt },
          'community-answer',
          undefined,
          model.thinkingConfig,
        );
        const body = result.text.trim();
        if (body === '') throw new Error('Empty answer');
        await addAnswer(ctx.db, {
          questionId: id,
          authorId: null,
          fromAi: true,
          body,
          now: new Date(),
        });
        return apiSuccess({ created: true });
      } catch (error) {
        log.warn('AI answer failed', error instanceof Error ? error.name : 'unknown error');
        return apiError('GENERATION_FAILED', 502, 'The AI answer could not be written.');
      }
    },
    { mutating: true },
  );
}
