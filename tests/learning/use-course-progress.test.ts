// @vitest-environment jsdom

/**
 * The classroom page reports where a learner is in a course they do not own, and opens it where
 * they stopped on another device. The owner and a guest are left alone.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    stage: { id: 'course-1' } as { id: string } | null,
    scenes: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }],
    currentSceneId: 's1' as string | null,
    isOwner: false,
    setCurrentSceneId: (id: string) => mocks.move(id),
  };
  const listeners = new Set<() => void>();
  return {
    state,
    listeners,
    move: (id: string) => {
      state.currentSceneId = id;
      listeners.forEach((listener) => listener());
    },
    fetchProgress: vi.fn(),
    putProgress: vi.fn(),
    position: vi.fn(),
    session: vi.fn(),
  };
});

vi.mock('@/lib/store', () => ({
  useStageStore: {
    getState: () => mocks.state,
    subscribe: (listener: () => void) => {
      mocks.listeners.add(listener);
      return () => mocks.listeners.delete(listener);
    },
  },
}));
vi.mock('@/components/learning/learning-api', () => ({
  fetchProgress: mocks.fetchProgress,
  putProgress: mocks.putProgress,
}));
vi.mock('@/lib/capabilities/use-capabilities', () => ({ useAccountSession: mocks.session }));
vi.mock('@/lib/document-store', () => ({ loadCurrentScene: mocks.position }));

import { reportQuizScore, useCourseProgress } from '@/lib/hooks/use-course-progress';

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ ready = true }: { ready?: boolean }) {
  useCourseProgress('course-1', ready);
  return null;
}

async function mount(element = createElement(Probe)): Promise<void> {
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  roots.push(root);
  await act(async () => root.render(element));
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.state.stage = { id: 'course-1' };
  mocks.state.currentSceneId = 's1';
  mocks.state.isOwner = false;
  mocks.session.mockReturnValue({ authenticated: true });
  mocks.position.mockResolvedValue(null);
  mocks.fetchProgress.mockResolvedValue([{ courseId: 'course-1', sceneId: 's3' }]);
  mocks.putProgress.mockResolvedValue({});
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  mocks.listeners.clear();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useCourseProgress', () => {
  it('opens at the scene reached on another device, then reports it', async () => {
    await mount();
    expect(mocks.state.currentSceneId).toBe('s3');

    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(mocks.putProgress).toHaveBeenCalledWith({
      courseId: 'course-1',
      sceneId: 's3',
      sceneIndex: 3,
      sceneCount: 4,
    });

    mocks.move('s4');
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(mocks.putProgress).toHaveBeenLastCalledWith(expect.objectContaining({ sceneIndex: 4 }));
  });

  it('keeps the position this device already has, and reports it instead of the server one', async () => {
    mocks.position.mockResolvedValue({ sceneId: 's2', updatedAt: '2026-10-18T00:00:00.000Z' });
    mocks.state.currentSceneId = 's2';

    await mount();
    await act(async () => vi.advanceTimersByTimeAsync(1500));

    expect(mocks.state.currentSceneId).toBe('s2');
    expect(mocks.putProgress).toHaveBeenCalledWith(expect.objectContaining({ sceneId: 's2' }));
  });

  it('adds a graded quiz score to the report', async () => {
    mocks.fetchProgress.mockResolvedValue([]);
    await mount();

    reportQuizScore('course-1', 75);
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(mocks.putProgress).toHaveBeenCalledWith(expect.objectContaining({ quizScore: 75 }));
  });

  it('reports nothing for the owner of the course', async () => {
    mocks.state.isOwner = true;
    await mount();
    mocks.move('s2');
    await act(async () => vi.advanceTimersByTimeAsync(5000));

    expect(mocks.putProgress).not.toHaveBeenCalled();
  });

  it('does nothing for a guest or before the course has loaded', async () => {
    mocks.session.mockReturnValue({ authenticated: false });
    await mount();
    expect(mocks.fetchProgress).not.toHaveBeenCalled();

    mocks.session.mockReturnValue({ authenticated: true });
    await mount(createElement(Probe, { ready: false }));
    expect(mocks.fetchProgress).not.toHaveBeenCalled();
  });
});
