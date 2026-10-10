import { afterEach, describe, expect, it, vi } from 'vitest';

import { isTutorModerationEnabled } from '@/lib/config/feature-flags';
import {
  SAFE_MESSAGES,
  latestStudentText,
  pickLocale,
  safeMessage,
  eventsFromProducer,
  observationTexts,
  studentTexts,
  withTutorModeration,
  type ModerateFn,
} from '@/lib/tutor/chat-moderation';
import type { StatelessChatRequest, StatelessEvent } from '@/lib/types/chat';

type E<T extends StatelessEvent['type']> = Extract<StatelessEvent, { type: T }>;

const ALLOW = { allow: true, categories: [], model: 'm' } as const;
const verdict = (categories: string[]) =>
  ({ allow: false, categories, model: 'm' }) as Awaited<ReturnType<ModerateFn>>;

const userMsg = (text: string) => ({
  id: 'u1',
  role: 'user' as const,
  parts: [{ type: 'text' as const, text }],
});

function makeBody(
  messages: StatelessChatRequest['messages'],
  extra: Partial<StatelessChatRequest> = {},
  languageDirective?: string,
): StatelessChatRequest {
  return {
    messages,
    storeState: { stage: languageDirective ? { languageDirective } : null },
    config: { agentIds: ['default-1'] },
    apiKey: '',
    ...extra,
  } as unknown as StatelessChatRequest;
}

const start = (id = 'm1'): E<'agent_start'> => ({
  type: 'agent_start',
  data: { messageId: id, agentId: 'default-1', agentName: 'AI teacher' },
});
const end = (id = 'm1'): E<'agent_end'> => ({
  type: 'agent_end',
  data: { messageId: id, agentId: 'default-1' },
});
const text = (content: string, id = 'm1'): E<'text_delta'> => ({
  type: 'text_delta',
  data: { content, messageId: id },
});
const action = (name: string, id = 'm1', params: Record<string, unknown> = {}): E<'action'> => ({
  type: 'action',
  data: {
    actionId: `a-${name}`,
    actionName: name,
    params,
    agentId: 'default-1',
    messageId: id,
  },
});
const done = (extra: Partial<E<'done'>['data']> = {}): E<'done'> => ({
  type: 'done',
  data: { totalActions: 0, totalAgents: 1, agentHadContent: true, ...extra },
});

/** Fake `statelessGenerate`: records whether it was ever started. */
function fakeSource(events: StatelessEvent[], failAfter = false) {
  const state = { started: false };
  async function* gen(): AsyncGenerator<StatelessEvent> {
    state.started = true;
    for (const e of events) yield e;
    if (failAfter) throw new Error('upstream boom');
  }
  return { gen: gen(), state };
}

async function collect(it: AsyncIterable<StatelessEvent>): Promise<StatelessEvent[]> {
  const out: StatelessEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const types = (events: StatelessEvent[]) => events.map((e) => e.type);

afterEach(() => {
  delete process.env.OPENMAIC_TUTOR_MODERATION;
  delete process.env.MODEL_ROUTES;
});

describe('isTutorModerationEnabled', () => {
  it('is off unless explicitly set', () => {
    expect(isTutorModerationEnabled()).toBe(false);
    process.env.OPENMAIC_TUTOR_MODERATION = 'false';
    expect(isTutorModerationEnabled()).toBe(false);
    process.env.OPENMAIC_TUTOR_MODERATION = 'true';
    expect(isTutorModerationEnabled()).toBe(true);
    process.env.OPENMAIC_TUTOR_MODERATION = '1';
    expect(isTutorModerationEnabled()).toBe(true);
  });
});

describe('safe message table', () => {
  it('has vi and en text for every key', () => {
    for (const row of Object.values(SAFE_MESSAGES)) {
      expect(row.vi.length).toBeGreaterThan(10);
      expect(row.en.length).toBeGreaterThan(10);
    }
  });

  it('self-harm wins over other categories and mentions 111', () => {
    expect(safeMessage(['violence', 'self-harm'], 'vi')).toBe(SAFE_MESSAGES['self-harm'].vi);
    expect(SAFE_MESSAGES['self-harm'].vi).toContain('111');
    expect(SAFE_MESSAGES['self-harm'].en).toContain('111');
  });

  it('falls back to generic when no category is known', () => {
    expect(safeMessage([], 'en')).toBe(SAFE_MESSAGES.generic.en);
  });

  it('picks the locale from the language directive, default vi', () => {
    expect(pickLocale(undefined)).toBe('vi');
    expect(pickLocale('Vietnamese')).toBe('vi');
    expect(pickLocale('Respond in English')).toBe('en');
    expect(pickLocale('en-US')).toBe('en');
    expect(pickLocale('中文')).toBe('vi');
  });
});

describe('latestStudentText', () => {
  it('reads the text parts of a trailing user message', () => {
    expect(latestStudentText([userMsg('  hello  ')] as never)).toBe('hello');
  });

  it('is null when the last message is not from the student', () => {
    const a = { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] };
    expect(latestStudentText([userMsg('x'), a] as never)).toBeNull();
    expect(latestStudentText([] as never)).toBeNull();
  });
});

describe('withTutorModeration - input', () => {
  it('lets an allowed message through and moderates it as direction in', async () => {
    const mod = vi.fn<ModerateFn>().mockResolvedValue(ALLOW);
    const src = fakeSource([start(), text('Binary search halves the range.'), end(), done()]);
    const out = await collect(
      withTutorModeration(makeBody([userMsg('How does binary search work?')] as never), src.gen, {
        moderate: mod,
      }),
    );
    expect(mod.mock.calls[0][0]).toBe('How does binary search work?');
    expect(mod.mock.calls[0][1]).toMatchObject({ direction: 'in', locale: 'vi' });
    expect(src.state.started).toBe(true);
    expect(types(out)).toEqual(['agent_start', 'text_delta', 'agent_end', 'done']);
  });

  it('blocks: scripted safe turn, agent never runs, loop is handed back to the student', async () => {
    const mod = vi.fn<ModerateFn>().mockResolvedValue(verdict(['self-harm']));
    const src = fakeSource([start(), text('should never appear'), end(), done()]);
    const prev = {
      turnCount: 2,
      agentResponses: [],
      whiteboardLedger: [],
    };
    const out = await collect(
      withTutorModeration(makeBody([userMsg('bad')] as never, { directorState: prev }), src.gen, {
        moderate: mod,
      }),
    );
    expect(src.state.started).toBe(false);
    expect(mod).toHaveBeenCalledTimes(1);
    expect(types(out)).toEqual(['agent_start', 'text_delta', 'agent_end', 'cue_user', 'done']);
    const start0 = out[0] as E<'agent_start'>;
    const delta = out[1] as E<'text_delta'>;
    expect(delta.data.messageId).toBe(start0.data.messageId);
    expect(delta.data.content).toBe(SAFE_MESSAGES['self-harm'].vi);
    const fin = out[4] as E<'done'>;
    expect(fin.data).toMatchObject({ totalAgents: 1, totalActions: 0, cueUserReceived: true });
    expect(fin.data.directorState?.turnCount).toBe(3);
    expect(fin.data.directorState?.agentResponses.at(-1)?.agentId).toBe('default-1');
  });

  it('uses the English table when the stage language says English', async () => {
    const mod = vi.fn<ModerateFn>().mockResolvedValue(verdict(['hate']));
    const out = await collect(
      withTutorModeration(makeBody([userMsg('bad')] as never, {}, 'English'), fakeSource([]).gen, {
        moderate: mod,
      }),
    );
    expect((out[1] as E<'text_delta'>).data.content).toBe(SAFE_MESSAGES.hate.en);
    expect(mod.mock.calls[0][1].locale).toBe('en');
  });

  it('moderates earlier student messages too, even when the last message is from an agent', async () => {
    const mod = vi
      .fn<ModerateFn>()
      .mockImplementation(async (t) => (t === 'old bad' ? verdict(['hate']) : ALLOW));
    const a = { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] };
    const src = fakeSource([start(), text('x'), end(), done()]);
    const out = await collect(
      withTutorModeration(makeBody([userMsg('old bad'), a, userMsg('fine')] as never), src.gen, {
        moderate: mod,
      }),
    );
    expect(src.state.started).toBe(false);
    expect((out[1] as E<'text_delta'>).data.content).toBe(SAFE_MESSAGES.hate.vi);
  });

  it('studentTexts: last 10 user messages, deduped, includes action-* output text', () => {
    const many = Array.from({ length: 12 }, (_, i) => userMsg(`m${i}`));
    const t = studentTexts([...many, userMsg('m2'), userMsg('m2')] as never);
    expect(t).toHaveLength(9); // last 10 user messages = m4..m11 + m2, m2 deduped
    expect(t[0]).toBe('m4');
    const act = {
      id: 'x',
      role: 'user',
      parts: [{ type: 'action-foo', actionName: 'foo', output: { error: 'evil words' } }],
    };
    expect(studentTexts([act] as never)[0]).toContain('evil words');
  });

  it('caps input filter concurrency at 3 and stops launching after a block', async () => {
    let live = 0;
    let peak = 0;
    const mod = vi.fn<ModerateFn>().mockImplementation(async (t) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return t === 'm0' ? verdict(['hate']) : ALLOW;
    });
    const msgs = Array.from({ length: 10 }, (_, i) => userMsg(`m${i}`));
    await collect(
      withTutorModeration(makeBody(msgs as never), fakeSource([]).gen, { moderate: mod }),
    );
    expect(peak).toBeLessThanOrEqual(3);
    expect(mod.mock.calls.length).toBeLessThan(10);
  });

  it('fails closed when the filter throws or reports a failure', async () => {
    for (const mod of [
      vi.fn<ModerateFn>().mockRejectedValue(new Error('x')),
      vi.fn<ModerateFn>().mockResolvedValue(verdict([])),
    ]) {
      const src = fakeSource([start(), text('nope'), end(), done()]);
      const out = await collect(
        withTutorModeration(makeBody([userMsg('hi')] as never), src.gen, { moderate: mod }),
      );
      expect(src.state.started).toBe(false);
      expect((out[1] as E<'text_delta'>).data.content).toBe(SAFE_MESSAGES.generic.vi);
    }
  });

  it('fails closed with the real moderate() when tutor-moderation has no route', async () => {
    delete process.env.MODEL_ROUTES;
    const src = fakeSource([start(), text('nope'), end(), done()]);
    const out = await collect(withTutorModeration(makeBody([userMsg('hi')] as never), src.gen));
    expect(src.state.started).toBe(false);
    expect((out[1] as E<'text_delta'>).data.content).toBe(SAFE_MESSAGES.generic.vi);
  });
});

describe('observationTexts and the input filter', () => {
  const packet = (observation: unknown) =>
    ({ sourceHtmlHash: 'a'.repeat(64), snapshot: { status: 'available', observation } }) as never;

  it('is empty without an observation, and serializes the observation otherwise', () => {
    expect(observationTexts(undefined)).toEqual([]);
    expect(observationTexts(packet(undefined))).toEqual([]);
    expect(observationTexts(packet({ answer: 'typed by the student' }))).toEqual([
      '{"answer":"typed by the student"}',
    ]);
  });

  it('slices a long observation so no part is left unscreened', () => {
    const slices = observationTexts(packet({ text: 'x'.repeat(9_000) }));
    expect(slices.length).toBeGreaterThan(1);
    expect(slices.join('')).toBe(JSON.stringify({ text: 'x'.repeat(9_000) }));
  });

  it('blocks when the page-reported state carries flagged text, with the agent never started', async () => {
    const mod = vi.fn<ModerateFn>(async (text) =>
      text.includes('flagged') ? verdict(['sexual']) : ALLOW,
    );
    const src = fakeSource([start(), text('should never appear'), end(), done()]);
    const out = await collect(
      withTutorModeration(
        makeBody(
          [userMsg('a harmless question')] as never,
          {
            interactiveState: packet({ answer: 'flagged words' }),
          } as never,
        ),
        src.gen,
        { moderate: mod },
      ),
    );
    expect(src.state.started).toBe(false);
    expect(mod.mock.calls.some(([t]) => t.includes('flagged words'))).toBe(true);
    expect(types(out)).toEqual(['agent_start', 'text_delta', 'agent_end', 'cue_user', 'done']);
  });
});

describe('withTutorModeration - output', () => {
  const body = makeBody([] as never);

  it('holds text until agent_end, moderates the joined text, then flushes in order', async () => {
    const order: string[] = [];
    const mod = vi.fn<ModerateFn>().mockImplementation(async () => {
      order.push('moderate');
      return ALLOW;
    });
    const events = [
      { type: 'thinking', data: { stage: 'agent_loading' } } as StatelessEvent,
      start(),
      text('Hello '),
      action('spotlight'),
      text('world'),
      end(),
      { type: 'cue_user', data: { fromAgentId: 'default-1' } } as StatelessEvent,
      done({ totalActions: 1 }),
    ];
    const out: StatelessEvent[] = [];
    for await (const e of withTutorModeration(body, fakeSource(events).gen, { moderate: mod })) {
      if (e.type === 'text_delta') order.push('text');
      out.push(e);
    }
    expect(mod).toHaveBeenCalledTimes(1);
    expect(mod.mock.calls[0][0]).toBe('Hello world');
    expect(mod.mock.calls[0][1]).toMatchObject({ direction: 'out' });
    expect(order[0]).toBe('moderate');
    expect(types(out)).toEqual([
      'thinking',
      'agent_start',
      'text_delta',
      'action',
      'text_delta',
      'agent_end',
      'cue_user',
      'done',
    ]);
  });

  it('passes non-text events through before a held message settles', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const mod = vi.fn<ModerateFn>().mockImplementation(async () => {
      await gate;
      return ALLOW;
    });
    const it = withTutorModeration(body, fakeSource([start(), text('a'), end(), done()]).gen, {
      moderate: mod,
    })[Symbol.asyncIterator]();
    expect(((await it.next()).value as StatelessEvent).type).toBe('agent_start');
    const pending = it.next(); // text is held, agent_end waits on the filter
    await new Promise((r) => setTimeout(r, 0));
    expect(mod).toHaveBeenCalledTimes(1);
    release();
    expect(((await pending).value as StatelessEvent).type).toBe('text_delta');
  });

  it('blocked: one safe text_delta, actions dropped, done scrubbed', async () => {
    const mod = vi.fn<ModerateFn>().mockResolvedValue(verdict(['personal-data']));
    const wb = {
      actionName: 'wb_draw_text',
      agentId: 'default-1',
      agentName: 'AI teacher',
      params: {},
    };
    const events = [
      start(),
      text('give me your phone number'),
      action('wb_draw_text'),
      action('spotlight'),
      end(),
      done({
        totalActions: 2,
        directorState: {
          turnCount: 1,
          agentResponses: [
            {
              agentId: 'default-1',
              agentName: 'AI teacher',
              contentPreview: 'give me your phone number',
              actionCount: 2,
              whiteboardActions: [wb as never],
            },
          ],
          whiteboardLedger: [wb as never],
        },
      }),
    ];
    const out = await collect(withTutorModeration(body, fakeSource(events).gen, { moderate: mod }));
    expect(types(out)).toEqual(['agent_start', 'text_delta', 'agent_end', 'done']);
    const delta = out[1] as E<'text_delta'>;
    expect(delta.data).toEqual({ content: SAFE_MESSAGES['personal-data'].vi, messageId: 'm1' });
    expect(JSON.stringify(out)).not.toContain('phone number');
    const fin = out[3] as E<'done'>;
    expect(fin.data.totalActions).toBe(0);
    expect(fin.data.directorState?.agentResponses[0]).toMatchObject({
      contentPreview: SAFE_MESSAGES['personal-data'].vi.slice(0, 100),
      actionCount: 0,
      whiteboardActions: [],
    });
    expect(fin.data.directorState?.whiteboardLedger).toEqual([]);
  });

  it('a moderation failure on output takes the safe path', async () => {
    const mod = vi.fn<ModerateFn>().mockResolvedValue(verdict([]));
    const out = await collect(
      withTutorModeration(body, fakeSource([start(), text('x'), action('a'), end()]).gen, {
        moderate: mod,
      }),
    );
    expect(types(out)).toEqual(['agent_start', 'text_delta', 'agent_end']);
    expect((out[1] as E<'text_delta'>).data.content).toBe(SAFE_MESSAGES.generic.vi);
  });

  it('moderates each messageId separately', async () => {
    const mod = vi
      .fn<ModerateFn>()
      .mockImplementation(async (t) => (t.includes('bad') ? verdict(['violence']) : ALLOW));
    const events = [
      start('m1'),
      text('fine', 'm1'),
      end('m1'),
      start('m2'),
      text('bad', 'm2'),
      action('spotlight', 'm2'),
      end('m2'),
      done(),
    ];
    const out = await collect(withTutorModeration(body, fakeSource(events).gen, { moderate: mod }));
    expect(mod).toHaveBeenCalledTimes(2);
    expect(out.filter((e) => e.type === 'action')).toHaveLength(0);
    const deltas = out.filter((e): e is E<'text_delta'> => e.type === 'text_delta');
    expect(deltas.map((d) => d.data.content)).toEqual(['fine', SAFE_MESSAGES.violence.vi]);
  });

  it('moderates free text in action params, even for action-only turns', async () => {
    const mod = vi
      .fn<ModerateFn>()
      .mockImplementation(async (t) => (t.includes('bad') ? verdict(['hate']) : ALLOW));
    const events = [
      start(),
      action('wb_draw_text', 'm1', { x: 1, content: 'bad words', elementId: 'e1' }),
      action('wb_draw_latex', 'm1', { latex: 'x^2', color: '#fff' }),
      end(),
      done({ totalActions: 2 }),
    ];
    const out = await collect(withTutorModeration(body, fakeSource(events).gen, { moderate: mod }));
    expect(mod.mock.calls[0][0]).toContain('bad words');
    expect(mod.mock.calls[0][0]).not.toContain('e1');
    expect(out.filter((e) => e.type === 'action')).toHaveLength(0);
    expect((out.find((e) => e.type === 'text_delta') as E<'text_delta'>).data.content).toBe(
      SAFE_MESSAGES.hate.vi,
    );
    expect((out.at(-1) as E<'done'>).data.totalActions).toBe(0);
  });

  it('keeps action-only turns without a filter call', async () => {
    const mod = vi.fn<ModerateFn>().mockResolvedValue(verdict(['violence']));
    const out = await collect(
      withTutorModeration(body, fakeSource([start(), action('spotlight'), end()]).gen, {
        moderate: mod,
      }),
    );
    expect(mod).not.toHaveBeenCalled();
    expect(types(out)).toEqual(['agent_start', 'action', 'agent_end']);
  });

  it('settles a message that never got agent_end when the stream finishes', async () => {
    const mod = vi.fn<ModerateFn>().mockResolvedValue(verdict(['hate']));
    const out = await collect(
      withTutorModeration(body, fakeSource([start(), text('rude')]).gen, { moderate: mod }),
    );
    expect(types(out)).toEqual(['agent_start', 'text_delta']);
    expect((out[1] as E<'text_delta'>).data.content).toBe(SAFE_MESSAGES.hate.vi);
  });

  it('drops held, unfiltered text when the source throws', async () => {
    const mod = vi.fn<ModerateFn>().mockResolvedValue(ALLOW);
    const seen: StatelessEvent[] = [];
    await expect(
      (async () => {
        for await (const e of withTutorModeration(
          body,
          fakeSource([start(), text('half a reply')], true).gen,
          { moderate: mod },
        )) {
          seen.push(e);
        }
      })(),
    ).rejects.toThrow('upstream boom');
    expect(types(seen)).toEqual(['agent_start']);
  });
});

describe('eventsFromProducer', () => {
  it('is lazy, forwards events in order, and rethrows producer errors after draining', async () => {
    let ran = false;
    const gen = eventsFromProducer(async (send) => {
      ran = true;
      await send(start());
      await send(end());
      throw new Error('loop boom');
    });
    expect(ran).toBe(false);
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const e of gen) seen.push(e.type);
      })(),
    ).rejects.toThrow('loop boom');
    expect(seen).toEqual(['agent_start', 'agent_end']);
  });

  it('never starts the producer when input is blocked (pi route path)', async () => {
    let ran = false;
    const mod = vi.fn<ModerateFn>().mockResolvedValue(verdict(['self-harm']));
    const out = await collect(
      withTutorModeration(
        makeBody([userMsg('bad')] as never),
        eventsFromProducer(async () => {
          ran = true;
        }),
        { moderate: mod },
      ),
    );
    expect(ran).toBe(false);
    expect(types(out)).toContain('cue_user');
  });
});
