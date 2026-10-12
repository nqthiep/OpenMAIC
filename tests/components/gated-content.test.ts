import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GatedContent } from '@/components/access-code-guard';

const LESSON_BUTTON = createElement('button', { type: 'button' }, 'Open lesson');

describe('GatedContent', () => {
  it('marks the page inert while the access prompt is up', () => {
    const markup = renderToStaticMarkup(
      createElement(GatedContent, { gated: true }, LESSON_BUTTON),
    );

    expect(markup).toContain('inert=""');
    expect(markup).toContain('Open lesson');
  });

  it('leaves the page interactive once the visitor is through the gate', () => {
    const markup = renderToStaticMarkup(
      createElement(GatedContent, { gated: false }, LESSON_BUTTON),
    );

    expect(markup).not.toContain('inert');
    expect(markup).toContain('Open lesson');
  });
});
