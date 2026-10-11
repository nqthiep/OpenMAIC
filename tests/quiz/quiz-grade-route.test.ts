/**
 * A failed model call or a reply without a usable score answers 503
 * GRADING_UNAVAILABLE with no score, so the client keeps the question ungraded.
 * The route never falls back to a guessed score, and the reply stays out of the log.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'sk-leaked-9f2c';

const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.callLLM }));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: vi.fn(async () => ({
    model: {},
    thinkingConfig: undefined,
    serverManaged: false,
  })),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: mocks.logError, debug: vi.fn() }),
}));

import { POST } from '@/app/api/quiz-grade/route';

function gradeRequest(): Parameters<typeof POST>[0] {
  return new Request('http://localhost/api/quiz-grade', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'Vì sao tìm kiếm nhị phân nhanh?',
      userAnswer: 'Mỗi bước chia đôi khoảng tìm kiếm.',
      points: 4,
      language: 'vi-VN',
    }),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.stubEnv('OPENMAIC_TUTOR_MODERATION', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/quiz-grade with a usable reply', () => {
  it('returns the model score and comment', async () => {
    mocks.callLLM.mockResolvedValue({ text: '{"score": 3, "comment": "Đúng ý chính."}' });

    const res = await POST(gradeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, score: 3, comment: 'Đúng ý chính.' });
  });

  it('accepts a score of 0 and a reply wrapped in a code fence', async () => {
    mocks.callLLM.mockResolvedValue({
      text: '```json\n{"score": 0, "comment": "Chưa đúng."}\n```',
    });

    const res = await POST(gradeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ score: 0, comment: 'Chưa đúng.' });
  });

  it.each([
    ['3', 3],
    ['0', 0],
  ])('reads the decimal score text "%s" as the score %i', async (text, score) => {
    mocks.callLLM.mockResolvedValue({ text: `{"score": "${text}", "comment": "Đúng ý chính."}` });

    const res = await POST(gradeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, score, comment: 'Đúng ý chính.' });
  });
});

describe('POST /api/quiz-grade without a usable score', () => {
  it.each([
    ['text with no JSON', 'Bạn trả lời khá tốt.'],
    ['JSON without a score', '{"comment": "Đúng ý chính."}'],
    ['score null', '{"score": null, "comment": "Đúng ý chính."}'],
    ['score text that is empty', '{"score": "", "comment": "Đúng ý chính."}'],
    ['score text that is not a number', '{"score": "ba", "comment": "Đúng ý chính."}'],
    ['score text NaN', '{"score": "NaN", "comment": "Đúng ý chính."}'],
    ['score text Infinity', '{"score": "Infinity", "comment": "Đúng ý chính."}'],
    ['hexadecimal score text', '{"score": "0x3", "comment": "Đúng ý chính."}'],
    ['score text above full marks', '{"score": "9", "comment": "Đúng ý chính."}'],
    ['score above full marks', '{"score": 9, "comment": "Đúng ý chính."}'],
    ['negative score', '{"score": -1, "comment": "Đúng ý chính."}'],
    ['score overflowing to infinity', '{"score": 1e400, "comment": "Đúng ý chính."}'],
  ])('answers 503 with no score for %s', async (_case, text) => {
    mocks.callLLM.mockResolvedValue({ text });

    const res = await POST(gradeRequest());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'GRADING_UNAVAILABLE',
      error: expect.any(String),
    });
  });

  it('keeps the model reply out of the server log', async () => {
    mocks.callLLM.mockResolvedValue({ text: 'Bạn trả lời khá tốt.' });

    await POST(gradeRequest());

    expect(mocks.logError).toHaveBeenCalled();
    expect(mocks.logError.mock.calls.flat().join(' ')).not.toContain('Bạn trả lời khá tốt.');
  });
});

describe('POST /api/quiz-grade when the model call fails', () => {
  it('answers 503 with no score, and the cause reaches the log but not the response', async () => {
    mocks.callLLM.mockRejectedValue(new TypeError(`fetch failed ${SECRET}`));

    const res = await POST(gradeRequest());
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({ success: false, errorCode: 'GRADING_UNAVAILABLE' });
    expect(JSON.parse(text)).not.toHaveProperty('score');
    expect(text).not.toContain(SECRET);
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(String), expect.any(TypeError));
  });
});
