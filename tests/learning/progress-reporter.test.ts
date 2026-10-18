import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProgressReporter, type Position } from '@/lib/learning/progress-reporter';

const at = (n: number, courseId = 'c1'): Position => ({
  courseId,
  sceneId: `s${n}`,
  sceneIndex: n,
  sceneCount: 5,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('progress reporter', () => {
  it('sends only where the learner settled, once per move', async () => {
    const send = vi.fn().mockResolvedValue({});
    const reporter = createProgressReporter(send, 1000);

    reporter.moveTo(at(1));
    reporter.moveTo(at(2));
    reporter.moveTo(at(3));
    await vi.advanceTimersByTimeAsync(999);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith({ ...at(3) });

    // The same scene again is not a move.
    reporter.moveTo(at(3));
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends a quiz score at once with the current position, and only for the course on screen', async () => {
    const send = vi.fn().mockResolvedValue({});
    const reporter = createProgressReporter(send, 1000);
    reporter.moveTo(at(2));

    reporter.quiz('other-course', 50);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).not.toHaveBeenCalled();

    reporter.quiz('c1', 66.6);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith({ ...at(2), quizScore: 67 });

    // The score is sent once; the next report carries the position alone.
    reporter.moveTo(at(3));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenLastCalledWith({ ...at(3) });
  });

  it('flushes a pending move when the page is left', async () => {
    const send = vi.fn().mockResolvedValue({});
    const reporter = createProgressReporter(send, 1000);
    reporter.moveTo(at(4));
    reporter.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith({ ...at(4) });
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps a quiz score whose report failed for the next one, and never overlaps two reports', async () => {
    let release!: () => void;
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    const reporter = createProgressReporter(send, 1000);
    reporter.moveTo(at(2));
    reporter.quiz('c1', 80);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);

    reporter.moveTo(at(3));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenLastCalledWith({ ...at(3), quizScore: 80 });

    // Still in flight: a further move waits for it.
    reporter.moveTo(at(4));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(3);
  });
});
