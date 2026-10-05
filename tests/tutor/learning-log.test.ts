import type { RuntimeRecord, RuntimeSession } from '@openmaic/dsl';
import type { RuntimeStore } from '@openmaic/storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_RUNTIME_PAYLOAD_VALIDATORS } from '@/lib/runtime/payload-validators';
import type { WidgetRuntimeMap } from '@/lib/store/widget-runtime-state';
import {
  appendTutorLearning,
  buildBeatRecord,
  buildHintRecord,
  buildPredictionRecord,
  buildRatingRecord,
  HintCounter,
  tutorLearningSessionId,
  watchWidgetRuntime,
  type SceneBeats,
  type TutorLearningPayload,
  type WidgetRuntimeSource,
} from '@/lib/tutor/learning-log';

const valid = (p: unknown) => APP_RUNTIME_PAYLOAD_VALIDATORS.tutorLearning(p).valid;

const BEAT_INPUT = {
  sceneId: 's1',
  walkthroughId: 'binary-search',
  entryRev: 3,
  preset: 'absent',
  beatId: 'mid',
  occurrence: 2,
  at: '2026-10-01T09:00:00Z',
};

describe('builders', () => {
  it('buildBeatRecord output passes the validator and drops extra keys', () => {
    const rec = buildBeatRecord({ ...BEAT_INPUT, junk: 1 } as typeof BEAT_INPUT);
    expect(rec).toEqual({ type: 'beat', ...BEAT_INPUT });
    expect(valid(rec)).toBe(true);
  });

  it('buildPredictionRecord defaults skipped to false', () => {
    const rec = buildPredictionRecord({ sceneId: 's1', beatId: 'mid', correct: true });
    expect(rec).toEqual({
      type: 'prediction',
      sceneId: 's1',
      beatId: 'mid',
      correct: true,
      skipped: false,
    });
    expect(valid(rec)).toBe(true);
    const skipped = buildPredictionRecord({
      sceneId: 's1',
      beatId: 'mid',
      correct: false,
      skipped: true,
    });
    expect(skipped.skipped).toBe(true);
    expect(valid(skipped)).toBe(true);
  });

  it('buildHintRecord clamps level to 1..3 as an integer', () => {
    const level = (n: number) => buildHintRecord({ sceneId: 's', beatId: 'b', level: n }).level;
    expect([level(0), level(-5), level(1), level(2), level(3), level(4), level(99)]).toEqual([
      1, 1, 1, 2, 3, 3, 3,
    ]);
    expect(level(2.6)).toBe(3);
    expect(level(Number.NaN)).toBe(1);
    expect(valid(buildHintRecord({ sceneId: 's', beatId: 'b', level: 99 }))).toBe(true);
  });

  it('buildRatingRecord clamps easy to 1..5 as an integer', () => {
    const easy = (n: number) => buildRatingRecord({ stageId: 'st', easy: n }).easy;
    expect([easy(0), easy(1), easy(3), easy(5), easy(6), easy(-1)]).toEqual([1, 1, 3, 5, 5, 1]);
    expect(easy(3.4)).toBe(3);
    expect(easy(Number.POSITIVE_INFINITY)).toBe(1);
    expect(valid(buildRatingRecord({ stageId: 'st', easy: 100 }))).toBe(true);
  });
});

describe('HintCounter', () => {
  it('counts per (sceneId, beatId) and clamps at 3', () => {
    const c = new HintCounter();
    expect([1, 2, 3, 4, 5].map(() => c.next('s1', 'mid'))).toEqual([1, 2, 3, 3, 3]);
    expect(c.next('s1', 'start')).toBe(1);
    expect(c.next('s2', 'mid')).toBe(1);
    expect(c.next('s1', 'mid')).toBe(3);
  });

  it('does not confuse pairs whose ids concatenate to the same text', () => {
    const c = new HintCounter();
    c.next('a:b', 'c');
    expect(c.next('a', 'b:c')).toBe(1);
  });

  it('instances are independent', () => {
    const a = new HintCounter();
    a.next('s', 'b');
    expect(new HintCounter().next('s', 'b')).toBe(1);
  });
});

interface FakeStore extends RuntimeStore {
  sessions: Map<string, RuntimeSession>;
  records: RuntimeRecord[];
  createCalls: number;
}

/** In-memory subset of RuntimeStore; `appendRecord` runs the real tutorLearning validator. */
function fakeStore(opts: { raceOnCreate?: boolean; failAppend?: boolean } = {}): FakeStore {
  const sessions = new Map<string, RuntimeSession>();
  const records: RuntimeRecord[] = [];
  const store = {
    sessions,
    records,
    createCalls: 0,
    async getSession(id: string) {
      return sessions.get(id);
    },
    async createSession(init: Omit<RuntimeSession, 'runtimeDslVersion'>) {
      store.createCalls += 1;
      const session = { ...init, runtimeDslVersion: '1' } as RuntimeSession;
      if (sessions.has(init.id)) throw new Error('exists');
      if (opts.raceOnCreate) {
        sessions.set(init.id, session); // another tab won the create after our read
        throw new Error('exists');
      }
      sessions.set(init.id, session);
      return session;
    },
    async appendRecord(init: Omit<RuntimeRecord, 'seq'>) {
      if (opts.failAppend) throw new Error('disk full');
      const session = sessions.get(init.sessionId);
      if (!session || session.status !== 'active') throw new Error('no active session');
      const check = APP_RUNTIME_PAYLOAD_VALIDATORS.tutorLearning(init.payload);
      if (!check.valid) throw new Error(check.errors.map((e) => e.message).join(';'));
      const record = { ...init, seq: records.length } as RuntimeRecord;
      records.push(record);
      return record;
    },
  };
  return store as unknown as FakeStore;
}

describe('appendTutorLearning', () => {
  const rating = buildRatingRecord({ stageId: 'st/1', easy: 4 });
  const base = (store: FakeStore) => ({
    store,
    learnerKey: 'anon:abc def',
    now: () => '2026-10-01T09:00:00.000Z',
    mintId: (() => {
      let n = 0;
      return () => `rec-${++n}`;
    })(),
  });

  afterEach(() => vi.restoreAllMocks());

  it('creates a deterministic session and appends a record with a sceneId anchor', async () => {
    const store = fakeStore();
    await appendTutorLearning('st/1', rating, 'scene-1', base(store));

    const sessionId = 'tutorLearning:st%2F1:anon%3Aabc%20def';
    expect(tutorLearningSessionId('st/1', 'anon:abc def')).toBe(sessionId);
    expect([...store.sessions.values()]).toEqual([
      {
        id: sessionId,
        kind: 'tutorLearning',
        stageId: 'st/1',
        learnerKey: 'anon:abc def',
        status: 'active',
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-01T09:00:00.000Z',
        runtimeDslVersion: '1',
      },
    ]);
    expect(store.records).toEqual([
      {
        id: 'rec-1',
        sessionId,
        sceneId: 'scene-1',
        createdAt: '2026-10-01T09:00:00.000Z',
        payload: rating,
        seq: 0,
      },
    ]);
  });

  it('omits sceneId when not given and reuses the session on later calls', async () => {
    const store = fakeStore();
    const deps = base(store);
    await appendTutorLearning('st/1', rating, undefined, deps);
    await appendTutorLearning('st/1', rating, undefined, deps);
    expect(store.createCalls).toBe(1);
    expect(store.sessions.size).toBe(1);
    expect(store.records.map((r) => r.id)).toEqual(['rec-1', 'rec-2']);
    expect('sceneId' in store.records[0]).toBe(false);
  });

  it('uses a separate session per stage and per learner', async () => {
    const store = fakeStore();
    await appendTutorLearning('a', rating, undefined, { ...base(store), learnerKey: 'k1' });
    await appendTutorLearning('b', rating, undefined, { ...base(store), learnerKey: 'k1' });
    await appendTutorLearning('a', rating, undefined, { ...base(store), learnerKey: 'k2' });
    expect(store.sessions.size).toBe(3);
  });

  it('recovers when another writer creates the session first', async () => {
    const store = fakeStore({ raceOnCreate: true });
    await appendTutorLearning('st/1', rating, 's', base(store));
    expect(store.createCalls).toBe(1);
    expect(store.records).toHaveLength(1);
  });

  it('concurrent first writes end up in one session', async () => {
    const store = fakeStore();
    const deps = base(store);
    await Promise.all([
      appendTutorLearning('st/1', rating, undefined, deps),
      appendTutorLearning('st/1', rating, undefined, deps),
      appendTutorLearning('st/1', rating, undefined, deps),
    ]);
    expect(store.sessions.size).toBe(1);
    expect(store.records).toHaveLength(3);
  });

  it('warns and resolves when the store fails, instead of rejecting', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = fakeStore({ failAppend: true });
    await expect(appendTutorLearning('st/1', rating, 's', base(store))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('refuses a same-id session that belongs to another partition', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = fakeStore();
    const id = tutorLearningSessionId('st/1', 'anon:abc def');
    store.sessions.set(id, {
      id,
      kind: 'chat',
      stageId: 'st/1',
      learnerKey: 'x',
    } as RuntimeSession);
    await appendTutorLearning('st/1', rating, 's', base(store));
    expect(store.records).toHaveLength(0);
  });

  it('a payload the validator rejects is not stored', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = fakeStore();
    await appendTutorLearning(
      'st/1',
      { type: 'rating', stageId: 'st/1', easy: 4, extra: 1 } as unknown as TutorLearningPayload,
      undefined,
      base(store),
    );
    expect(store.records).toHaveLength(0);
  });
});

/** Minimal zustand-like source: `set` replaces the map and notifies with (next, prev). */
function fakeWidgetSource() {
  let current: { byScene: WidgetRuntimeMap } = { byScene: {} };
  const listeners = new Set<Parameters<WidgetRuntimeSource['subscribe']>[0]>();
  const source: WidgetRuntimeSource = {
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  const set = (byScene: WidgetRuntimeMap) => {
    const prev = current;
    current = { byScene };
    for (const l of [...listeners]) l(current, prev);
  };
  return { source, set, listeners };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const BEATS: SceneBeats = {
  walkthroughId: 'binary-search',
  entryRev: 3,
  beats: [
    { id: 'start', occurrence: 1, frame: 0 },
    { id: 'mid', occurrence: 1, frame: 1 },
    { id: 'mid', occurrence: 2, frame: 4 },
  ],
};

describe('watchWidgetRuntime', () => {
  function setup(beatsOf?: (sceneId: string, preset: string) => SceneBeats | undefined) {
    const w = fakeWidgetSource();
    const append = vi.fn<
      (stageId: string, payload: TutorLearningPayload, sceneId?: string) => Promise<void>
    >(async () => {});
    const stop = watchWidgetRuntime(w.source, 'stage-1', append, {
      beatsOf: beatsOf ?? ((sceneId) => (sceneId === 's1' ? BEATS : undefined)),
      now: () => '2026-10-01T09:00:00Z',
    });
    const state = (
      frame: number,
      extra: { prediction?: { beatId: string; correct: boolean }; preset?: string } = {},
    ): WidgetRuntimeMap => ({
      s1: { ready: true, state: { preset: extra.preset ?? 'absent', frame, ...extra } },
    });
    return { ...w, append, stop, state };
  }

  it('appends a beat record when the frame reaches a beat frame', async () => {
    const t = setup();
    t.set(t.state(0));
    await flush();
    expect(t.append).toHaveBeenCalledTimes(1);
    const [stageId, payload, sceneId] = t.append.mock.calls[0];
    expect(stageId).toBe('stage-1');
    expect(sceneId).toBe('s1');
    expect(payload).toEqual({
      type: 'beat',
      sceneId: 's1',
      walkthroughId: 'binary-search',
      entryRev: 3,
      preset: 'absent',
      beatId: 'start',
      occurrence: 1,
      at: '2026-10-01T09:00:00Z',
    });
    expect(valid(payload)).toBe(true);
  });

  it('ignores frames that are not beat frames, and a missing beat map', async () => {
    const t = setup();
    t.set(t.state(2));
    t.set({ other: { ready: true, state: { preset: 'absent', frame: 0 } } });
    await flush();
    expect(t.append).not.toHaveBeenCalled();
  });

  it('records each beat occurrence once, with its own occurrence number', async () => {
    const t = setup();
    t.set(t.state(0));
    t.set(t.state(1));
    t.set(t.state(0)); // seek back: already seen
    t.set(t.state(1));
    t.set(t.state(4));
    await flush();
    const got = t.append.mock.calls
      .map(([, p]) => p)
      .map((p) => p.type === 'beat' && [p.beatId, p.occurrence]);
    expect(got).toEqual([
      ['start', 1],
      ['mid', 1],
      ['mid', 2],
    ]);
  });

  it('appends a prediction record when state.prediction appears, not on every repeat', async () => {
    const t = setup();
    t.set(t.state(2, { prediction: { beatId: 'mid', correct: false } }));
    t.set(t.state(3, { prediction: { beatId: 'mid', correct: false } })); // sticky copy
    await flush();
    expect(t.append).toHaveBeenCalledTimes(1);
    expect(t.append.mock.calls[0][1]).toEqual({
      type: 'prediction',
      sceneId: 's1',
      beatId: 'mid',
      correct: false,
      skipped: false,
    });
    expect(valid(t.append.mock.calls[0][1])).toBe(true);
  });

  it('records a prediction again after it disappeared or changed', async () => {
    const t = setup();
    t.set(t.state(2, { prediction: { beatId: 'mid', correct: false } }));
    t.set(t.state(2, { prediction: { beatId: 'mid', correct: true } })); // changed
    t.set(t.state(2)); // cleared
    t.set(t.state(2, { prediction: { beatId: 'mid', correct: true } })); // reappears
    await flush();
    expect(t.append).toHaveBeenCalledTimes(3);
  });

  it('writes beat before prediction when one state carries both, in order', async () => {
    const t = setup();
    t.set(t.state(1, { prediction: { beatId: 'mid', correct: true } }));
    await flush();
    expect(t.append.mock.calls.map(([, p]) => p.type)).toEqual(['beat', 'prediction']);
  });

  it('passes the preset to beatsOf and records that preset', async () => {
    const beatsOf = vi.fn(() => BEATS);
    const t = setup(beatsOf);
    t.set(t.state(0, { preset: 'mid-hit' }));
    await flush();
    expect(beatsOf).toHaveBeenCalledWith('s1', 'mid-hit');
    expect(t.append.mock.calls[0][1]).toMatchObject({ preset: 'mid-hit' });
  });

  it('keeps going after an append failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup();
    t.append.mockRejectedValueOnce(new Error('boom'));
    t.set(t.state(0));
    t.set(t.state(1));
    await flush();
    expect(t.append).toHaveBeenCalledTimes(2);
  });

  it('stop unsubscribes', async () => {
    const t = setup();
    expect(t.listeners.size).toBe(1);
    t.stop();
    expect(t.listeners.size).toBe(0);
    t.set(t.state(0));
    await flush();
    expect(t.append).not.toHaveBeenCalled();
  });
});
