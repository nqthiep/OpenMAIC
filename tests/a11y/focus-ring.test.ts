import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// A focus ring at partial opacity (ring-ring/50, ring-destructive/20) is under the 3:1 that a
// focus indicator needs.
const PARTIAL_FOCUS_RING = /(^|\s)(dark:)?focus-visible:ring-[\w-]+\/\d+/;

const classNames = (value: string) => value.split(/\s+/);

describe('focus rings', () => {
  it.each(['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const)(
    'are fully opaque on the %s button',
    (variant) => {
      expect(buttonVariants({ variant })).not.toMatch(PARTIAL_FOCUS_RING);
    },
  );

  it('use the ring colour itself on the default button', () => {
    expect(classNames(buttonVariants())).toContain('focus-visible:ring-ring');
  });

  it('are fully opaque on the input and use the ring colour', () => {
    const markup = renderToStaticMarkup(createElement(Input, { type: 'text' }));
    const classes = markup.match(/class="([^"]*)"/)![1];
    expect(classes).not.toMatch(PARTIAL_FOCUS_RING);
    expect(classNames(classes)).toContain('focus-visible:ring-ring');
  });
});
