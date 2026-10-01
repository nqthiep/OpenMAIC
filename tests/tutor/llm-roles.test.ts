import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getTutorRoute', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.MODEL_ROUTES;
    delete process.env.DEFAULT_MODEL;
  });
  afterEach(() => {
    delete process.env.MODEL_ROUTES;
    delete process.env.DEFAULT_MODEL;
  });

  it('returns the configured route for a tutor stage', async () => {
    process.env.MODEL_ROUTES = JSON.stringify({ 'tutor-moderation': 'openai:gpt-5.4' });
    const { getTutorRoute } = await import('@/lib/tutor/llm-roles');
    expect(getTutorRoute('tutor-moderation')).toEqual({ model: 'openai:gpt-5.4' });
  });

  it('accepts all new stages', async () => {
    const stages = [
      'tutor-moderation',
      'tutor-review-cp',
      'tutor-review-cp-2',
      'tutor-review-code',
      'sim-learner',
      'tutor-analyst',
    ];
    process.env.MODEL_ROUTES = JSON.stringify(Object.fromEntries(stages.map((s) => [s, `m:${s}`])));
    const { getTutorRoute } = await import('@/lib/tutor/llm-roles');
    for (const s of stages) {
      expect(getTutorRoute(s as never)?.model).toBe(`m:${s}`);
    }
  });

  it('returns null when no route is configured', async () => {
    const { getTutorRoute } = await import('@/lib/tutor/llm-roles');
    expect(getTutorRoute('tutor-analyst')).toBeNull();
  });

  it('returns null even when DEFAULT_MODEL is set', async () => {
    process.env.DEFAULT_MODEL = 'openai:gpt-5.4';
    const { getTutorRoute } = await import('@/lib/tutor/llm-roles');
    expect(getTutorRoute('tutor-review-cp')).toBeNull();
  });
});
