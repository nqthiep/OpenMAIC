import { describe, expect, it } from 'vitest';
import { THEME_INIT_SCRIPT } from '@/lib/theme-init-script';

/** Runs the head script against a fake page and says whether it added the `dark` class. */
function runs(saved: string | null | 'throws', systemDark = false): boolean {
  const classes = new Set<string>();
  const localStorage = {
    getItem: () => {
      if (saved === 'throws') throw new Error('blocked');
      return saved;
    },
  };
  const matchMedia = () => ({ matches: systemDark });
  const document = { documentElement: { classList: { add: (c: string) => classes.add(c) } } };
  new Function('localStorage', 'matchMedia', 'document', THEME_INIT_SCRIPT)(
    localStorage,
    matchMedia,
    document,
  );
  return classes.has('dark');
}

describe('theme init script', () => {
  it('is dark when the visitor never chose, even if the system is light', () => {
    expect(runs(null, false)).toBe(true);
  });
  it('is dark when storage cannot be read', () => {
    expect(runs('throws')).toBe(true);
  });
  it('keeps the visitor’s choice', () => {
    expect(runs('dark')).toBe(true);
    expect(runs('light', true)).toBe(false);
  });
  it('follows the system only when the visitor chose "system"', () => {
    expect(runs('system', true)).toBe(true);
    expect(runs('system', false)).toBe(false);
  });
});
