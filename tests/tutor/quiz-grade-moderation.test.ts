import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  moderate: vi.fn(),
}));

vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.callLLM }));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: vi.fn(async () => ({ model: {}, thinkingConfig: undefined })),
}));
vi.mock('@/lib/tutor/moderation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tutor/moderation')>()),
  moderate: mocks.moderate,
}));

import { POST } from '@/app/api/quiz-grade/route';
import { SAFE_MESSAGES } from '@/lib/tutor/chat-moderation';

const ALLOW = { allow: true, categories: [], model: 'm' };

function request(userAnswer = 'binary search halves the range') {
  return new Request('http://localhost/api/quiz-grade', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Why is it fast?', userAnswer, points: 4, language: 'vi-VN' }),
  }) as unknown as Parameters<typeof POST>[0];
}

async function json(res: Response) {
  return (await res.json()) as { success: boolean; score: number; comment: string };
}

beforeEach(() => {
  vi.stubEnv('OPENMAIC_TUTOR_MODERATION', 'true');
  mocks.callLLM.mockResolvedValue({ text: '{"score": 3, "comment": "Good."}' });
  mocks.moderate.mockResolvedValue(ALLOW);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('/api/quiz-grade request validation', () => {
  it('answers 400, not a server error, when the question is not a string', async () => {
    const res = await POST(
      new Request('http://localhost/api/quiz-grade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 123, userAnswer: 'x', points: 4 }),
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });
});

describe('/api/quiz-grade with the tutor content filter', () => {
  it('flag off: no filter call and the grade is untouched', async () => {
    vi.stubEnv('OPENMAIC_TUTOR_MODERATION', '');
    const body = await json(await POST(request()));
    expect(mocks.moderate).not.toHaveBeenCalled();
    expect(body).toMatchObject({ score: 3, comment: 'Good.' });
  });

  it('allowed answer and allowed feedback pass through (both directions were screened)', async () => {
    const body = await json(await POST(request()));
    expect(mocks.moderate.mock.calls.map((c) => c[1].direction)).toEqual(['in', 'out']);
    expect(body).toMatchObject({ score: 3, comment: 'Good.' });
  });

  it('a blocked answer never reaches the grader and gets the safe message with score 0', async () => {
    mocks.moderate.mockResolvedValueOnce({ allow: false, categories: ['self-harm'], model: 'm' });
    const body = await json(await POST(request('...')));
    expect(mocks.callLLM).not.toHaveBeenCalled();
    expect(body).toEqual(
      expect.objectContaining({ score: 0, comment: SAFE_MESSAGES['self-harm'].vi }),
    );
  });

  it('blocked feedback is replaced but the score is kept', async () => {
    mocks.moderate
      .mockResolvedValueOnce(ALLOW)
      .mockResolvedValueOnce({ allow: false, categories: ['hate'], model: 'm' });
    const body = await json(await POST(request()));
    expect(body.score).toBe(3);
    expect(body.comment).toBe(SAFE_MESSAGES.hate.vi);
  });

  it('a real block on the way in answers 200 with score 0 and the safe message', async () => {
    mocks.moderate.mockResolvedValueOnce({ allow: false, categories: ['violence'], model: 'm' });
    const res = await POST(request('...'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      score: 0,
      comment: SAFE_MESSAGES.violence.vi,
    });
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it('a filter that throws answers 503 on the way in, and the grader never runs', async () => {
    mocks.moderate.mockRejectedValueOnce(new Error('route missing'));
    const res = await POST(request());
    expect(mocks.callLLM).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'GRADING_UNAVAILABLE',
      error: expect.any(String),
    });
  });

  it('a filter that returns an error verdict answers 503 on the way in, not a block', async () => {
    mocks.moderate.mockResolvedValueOnce({ allow: false, categories: [], model: '', error: true });
    const res = await POST(request());
    expect(mocks.callLLM).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, errorCode: 'GRADING_UNAVAILABLE' });
  });

  it('a filter that fails on the way out replaces the feedback and keeps the score', async () => {
    mocks.moderate
      .mockResolvedValueOnce(ALLOW)
      .mockResolvedValueOnce({ allow: false, categories: [], model: '', error: true });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      score: 3,
      comment: SAFE_MESSAGES.generic.vi,
    });
  });
});
