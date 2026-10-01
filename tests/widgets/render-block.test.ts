import { describe, expect, it } from 'vitest';
import { decideInteractiveMount } from '@/lib/widgets/policy';

const code = { type: 'interactive', widgetType: 'code' };
const sim = { type: 'interactive', widgetType: 'simulation' };

describe('decideInteractiveMount', () => {
  it('blocks code when flag unknown or false', () => {
    expect(decideInteractiveMount(code, undefined)).toBe('blocked');
    expect(decideInteractiveMount(code, false)).toBe('blocked');
  });
  it('mounts code when allowed', () => {
    expect(decideInteractiveMount(code, true)).toBe('mount');
  });
  it('mounts other widgets even when flag unknown', () => {
    expect(decideInteractiveMount(sim, undefined)).toBe('mount');
  });
  it('does not throw on odd data', () => {
    expect(decideInteractiveMount(null, undefined)).toBe('mount');
    expect(decideInteractiveMount('str', undefined)).toBe('mount');
  });
});
