import type { Scene } from '@openmaic/dsl';
import { describe, expect, it } from 'vitest';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { cpPack } from '@/lib/subjects/cp/pack';
import { createWidgetRegistry } from '@/lib/widgets/registry';
import type { AnyWalkthroughEntry, SubjectPack, WidgetProvider } from '@/lib/widgets/types';

const entry = (id: string): AnyWalkthroughEntry => ({ ...cpPack.walkthroughs[0], id });
const pack = (id: string, ...ids: string[]): SubjectPack => ({
  id,
  skillId: id,
  walkthroughs: ids.map(entry),
});
const provider = (id: string, claims: boolean): WidgetProvider => ({
  id,
  claimsScene: () => claims,
  build: () => {
    throw new Error('unused');
  },
  actions: () => [],
  describe: () => '',
});
const scene = { id: 's1' } as unknown as Scene;

describe('createWidgetRegistry', () => {
  it('throws on duplicate walkthroughId across packs, naming the id', () => {
    expect(() =>
      createWidgetRegistry({ providers: [], packs: [pack('a', 'x'), pack('b', 'x')] }),
    ).toThrow(/"x".*"a".*"b"/);
  });

  it('throws on duplicate walkthroughId inside one pack', () => {
    expect(() => createWidgetRegistry({ providers: [], packs: [pack('a', 'x', 'x')] })).toThrow(
      /"x"/,
    );
  });

  it('throws on duplicate provider id, naming the id', () => {
    expect(() =>
      createWidgetRegistry({
        providers: [provider('walkthrough', true), provider('walkthrough', false)],
        packs: [],
      }),
    ).toThrow(/walkthrough/);
  });

  it('providerForScene: 0 claimers → null, 1 → that provider, 2 → throws', () => {
    const none = createWidgetRegistry({ providers: [provider('a', false)], packs: [] });
    expect(none.providerForScene(scene)).toBeNull();

    const b = provider('b', true);
    const one = createWidgetRegistry({ providers: [provider('a', false), b], packs: [] });
    expect(one.providerForScene(scene)).toBe(b);

    const two = createWidgetRegistry({
      providers: [provider('a', true), provider('b', true)],
      packs: [],
    });
    expect(() => two.providerForScene(scene)).toThrow(/s1.*a, b/);
  });

  it('lists ids in pack order and finds entries', () => {
    const reg = createWidgetRegistry({
      providers: [],
      packs: [pack('a', 'x', 'y'), pack('b', 'z')],
    });
    expect(reg.walkthroughIds()).toEqual(['x', 'y', 'z']);
    expect(reg.findWalkthrough('y')?.id).toBe('y');
    expect(reg.findWalkthrough('nope')).toBeUndefined();
  });

  it('the real SUBJECT_PACKS register binary-search without clashes', () => {
    const reg = createWidgetRegistry({ providers: [], packs: SUBJECT_PACKS });
    expect(reg.walkthroughIds()).toContain('binary-search');
    expect(SUBJECT_PACKS.map((p) => p.id)).toEqual(['cp']);
  });
});
