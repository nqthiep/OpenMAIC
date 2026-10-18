import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandBand, BrandDecor, HomeHero, Slogan } from '@/components/home/brand-band';
import { SectionTitle } from '@/components/home/section-title';

describe('brand band', () => {
  it('sets the second half of the slogan in the accent yellow', () => {
    const html = renderToStaticMarkup(
      createElement(Slogan, { text: 'Hiểu chắc kiến thức · Vững bước vào kỳ thi' }),
    );
    expect(html).toContain('Hiểu chắc kiến thức');
    expect(html).toMatch(/<span class="[^"]*text-brand-yellow[^"]*">Vững bước vào kỳ thi<\/span>/);
  });

  it('shows a slogan without the separator whole and uncoloured', () => {
    expect(renderToStaticMarkup(createElement(Slogan, { text: 'Learn well' }))).toBe('Learn well');
  });

  it('keeps the band decorative and behind the hero content', () => {
    const html = renderToStaticMarkup(createElement(HomeHero, null, createElement('p', null, 'x')));
    expect(html).toContain('<p>x</p>');
    expect(html).toMatch(/<div aria-hidden="true" class="[^"]*-z-10/);
    expect(renderToStaticMarkup(createElement(BrandBand))).toContain('aria-hidden="true"');
  });

  it('keeps the compact decoration small, with one sun and no dotted patch', () => {
    const compact = renderToStaticMarkup(createElement(BrandDecor, { compact: true }));
    const full = renderToStaticMarkup(createElement(BrandDecor));
    expect(compact.match(/bg-brand-yellow/g)).toHaveLength(1);
    expect(compact).not.toContain('radial-gradient');
    expect(full).toContain('radial-gradient');
    expect(compact.length).toBeLessThan(full.length);
  });

  it('marks a block heading with the yellow bar', () => {
    const html = renderToStaticMarkup(createElement(SectionTitle, null, 'My classes'));
    expect(html).toMatch(/^<h2[^>]*>.*bg-brand-yellow.*My classes<\/h2>$/);
  });
});
