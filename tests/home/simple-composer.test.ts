import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountSession } from '@/components/account/account-api';
import {
  canChooseProvider,
  estimateTier,
  imageProviderWorks,
  pickModel,
  usableModels,
  type ModelChoice,
} from '@/lib/home/simple-composer';

const at = (providerId: string, ...ids: string[]): ModelChoice[] =>
  ids.map((modelId) => ({ providerId, modelId }));

describe('estimateTier', () => {
  it('sends a short plain topic to the fast tier', () => {
    expect(estimateTier('Quang hợp là gì', false)).toBe('fast');
  });
  it('keeps a medium request on the balanced tier', () => {
    expect(
      estimateTier('Dạy tôi về lịch sử triều Nguyễn và các cải cách chính của nó', false),
    ).toBe('balanced');
  });
  it('sends proofs and attached documents to the strong tier', () => {
    expect(estimateTier('Chứng minh bất đẳng thức Cauchy và phân tích các dấu bằng', false)).toBe(
      'strong',
    );
    expect(estimateTier('Tóm tắt tài liệu này', true)).toBe('strong');
  });
});

describe('pickModel', () => {
  const current = { providerId: 'openai', modelId: 'gpt-5.6' };
  const all = [...at('openai', 'gpt-5.6', 'gpt-5.4-mini'), ...at('anthropic', 'claude-sonnet-5')];

  it('takes the preferred model of the tier', () => {
    expect(pickModel('fast', all, current).modelId).toBe('gpt-5.4-mini');
    expect(pickModel('balanced', all, current).modelId).toBe('claude-sonnet-5');
    expect(pickModel('strong', all, current).modelId).toBe('gpt-5.6');
  });
  it('falls back to the nearest tier, up for a hard request and down for an easy one', () => {
    expect(pickModel('strong', at('openai', 'gpt-5.4-mini', 'gpt-5.4'), current).modelId).toBe(
      'gpt-5.4',
    );
    expect(pickModel('fast', at('openai', 'gpt-5.5'), current).modelId).toBe('gpt-5.5');
  });
  it('keeps the current model when nothing preferred is offered', () => {
    expect(pickModel('fast', at('x', 'unknown'), current)).toEqual(current);
  });
});

describe('usableModels', () => {
  it('lists models of usable providers and narrows a server provider to its server list', () => {
    const config = {
      openai: { isServerConfigured: true, models: [{ id: 'a' }, { id: 'b' }], serverModels: ['b'] },
      anthropic: { models: [{ id: 'c' }] }, // no key, not usable
    };
    expect(usableModels(config)).toEqual([{ providerId: 'openai', modelId: 'b' }]);
  });
});

describe('imageProviderWorks', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (body: unknown) => vi.fn().mockResolvedValue({ json: () => Promise.resolve(body) });

  it('is false when the check fails or the request errors, and asks again next time', async () => {
    const failing = reply({ success: false });
    vi.stubGlobal('fetch', failing);
    expect(await imageProviderWorks('p1', 'm')).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await imageProviderWorks('p1', 'm')).toBe(false);
    const recovered = reply({ success: true });
    vi.stubGlobal('fetch', recovered);
    expect(await imageProviderWorks('p1', 'm')).toBe(true);
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it('remembers a pass without asking again', async () => {
    const ok = reply({ success: true });
    vi.stubGlobal('fetch', ok);
    expect(await imageProviderWorks('p2', 'm')).toBe(true);
    expect(await imageProviderWorks('p2', 'm')).toBe(true);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe('canChooseProvider', () => {
  const as = (s: Partial<AccountSession>) => s as AccountSession;
  it('is for operators, administrators and the single local user only', () => {
    expect(canChooseProvider(as({ enabled: true, role: 'admin' }))).toBe(true);
    expect(canChooseProvider(as({ enabled: true, role: 'operator' }))).toBe(true);
    expect(canChooseProvider(as({ enabled: false }))).toBe(true);
    expect(canChooseProvider(as({ enabled: true, role: 'learner' }))).toBe(false);
    expect(canChooseProvider(as({ enabled: true }))).toBe(false);
    expect(canChooseProvider(undefined)).toBe(false);
    expect(canChooseProvider(null)).toBe(false);
  });
});
