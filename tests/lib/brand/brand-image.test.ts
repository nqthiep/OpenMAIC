import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandImage } from '@/components/brand/brand-image';
import { DEFAULT_BRAND } from '@/lib/brand/brand-config';

const render = (props: Parameters<typeof BrandImage>[0]) =>
  renderToStaticMarkup(createElement(BrandImage, props));

describe('BrandImage', () => {
  it('renders both files on a surface that follows the theme, and CSS shows one', () => {
    const html = render({ kind: 'logo', alt: 'KHAITAM', className: 'h-7' });
    expect(html.match(/<img /g)).toHaveLength(2);
    expect(html).toMatch(
      new RegExp(`<img src="${DEFAULT_BRAND.logoSrc}"[^>]*class="[^"]*dark:hidden`),
    );
    expect(html).toMatch(
      new RegExp(`<img src="${DEFAULT_BRAND.logoSrcOnDark}"[^>]*class="[^"]*hidden dark:block`),
    );
    expect(html.match(/h-7/g)).toHaveLength(2);
  });

  it('renders only the dark file on a surface that is navy in both themes', () => {
    const html = render({ kind: 'mark', surface: 'dark', alt: '', className: 'size-14' });
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain(`src="${DEFAULT_BRAND.markSrcOnDark}"`);
    expect(html).not.toContain(DEFAULT_BRAND.markSrc);
  });

  it('picks the mark files for kind="mark"', () => {
    const html = render({ kind: 'mark', alt: '' });
    expect(html).toContain(`src="${DEFAULT_BRAND.markSrc}"`);
    expect(html).toContain(`src="${DEFAULT_BRAND.markSrcOnDark}"`);
  });
});
