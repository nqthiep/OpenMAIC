import { beforeEach, describe, expect, it, vi } from 'vitest';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  } as Storage;
}

/** `GET /api/persistence/learner-key` answers in order: an account, then the anonymous owner after a sign-out elsewhere. */
function sessionAnswers(answers: Array<Record<string, unknown>>) {
  let index = 0;
  return vi.fn(async () => {
    const body = answers[Math.min(index, answers.length - 1)]!;
    index += 1;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('learner key re-read', () => {
  let focusListeners: Array<() => void>;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv('NEXT_PUBLIC_PERSISTENCE', '1');
    focusListeners = [];
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'focus') focusListeners.push(listener);
      },
    });
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('keeps the memoised key while the window stays focused and the key is fresh', async () => {
    const fetch = sessionAnswers([{ learnerKey: 'acct:one' }]);
    vi.stubGlobal('fetch', fetch);
    const { getPersistenceLearnerKey } = await import('@/lib/persistence/bootstrap');

    expect(await getPersistenceLearnerKey()).toBe('acct:one');
    expect(await getPersistenceLearnerKey()).toBe('acct:one');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('re-reads the session on focus, so a sign-out made in another tab takes effect', async () => {
    const fetch = sessionAnswers([
      { learnerKey: 'acct:one' },
      { learnerKey: 'anon:11111111-1111-4111-8111-111111111111' },
    ]);
    vi.stubGlobal('fetch', fetch);
    const { getPersistenceLearnerKey } = await import('@/lib/persistence/bootstrap');

    expect(await getPersistenceLearnerKey()).toBe('acct:one');
    for (const listener of focusListeners) listener();
    const afterSignOut = await getPersistenceLearnerKey();

    expect(afterSignOut).not.toBe('acct:one');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('re-reads the session once the memoised key is older than five minutes', async () => {
    const fetch = sessionAnswers([{ learnerKey: 'acct:one' }, { learnerKey: 'acct:two' }]);
    vi.stubGlobal('fetch', fetch);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const { getPersistenceLearnerKey } = await import('@/lib/persistence/bootstrap');
      expect(await getPersistenceLearnerKey()).toBe('acct:one');

      vi.setSystemTime(new Date('2026-01-01T00:05:01Z'));
      expect(await getPersistenceLearnerKey()).toBe('acct:two');
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
