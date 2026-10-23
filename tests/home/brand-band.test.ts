import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandArch, BrandBand, BrandDecor, HomeHero, Slogan } from '@/components/home/brand-band';
import { SectionTitle } from '@/components/home/section-title';

describe('brand band', () => {
  it('sets the second half of the slogan in the accent yellow', () => {
    const html = renderToStaticMarkup(
      createElement(Slogan, { text: 'Khai mở tri thức · Kiến tạo tương lai' }),
    );
    expect(html).toContain('Khai mở tri thức');
    expect(html).toMatch(/<span class="[^"]*text-brand-yellow[^"]*">Kiến tạo tương lai<\/span>/);
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

  it('keeps the compact decoration small, with no sun and no dotted patch', () => {
    const compact = renderToStaticMarkup(createElement(BrandDecor, { compact: true }));
    const full = renderToStaticMarkup(createElement(BrandDecor));
    expect(compact).not.toContain('bg-brand-yellow'); // the sun is a gold disc
    expect(compact).not.toContain('radial-gradient');
    expect(full.match(/bg-brand-yellow/g)).toHaveLength(1);
    expect(full).toContain('radial-gradient');
    expect(compact.length).toBeLessThan(full.length);
  });

  it('draws the sun with its rings, and three ridges of mountains, in the full decoration only', () => {
    const full = renderToStaticMarkup(createElement(BrandDecor));
    const compact = renderToStaticMarkup(createElement(BrandDecor, { compact: true }));
    expect(full.match(/fill-brand-(teal|700|950)/g)).toHaveLength(3);
    expect(full).toContain('border-brand-yellow/25'); // the ring around the sun
    expect(compact).not.toContain('<svg viewBox="0 0 1440 320"');
  });

  it('draws the doorway motif as a decoration that assistive technology skips', () => {
    const html = renderToStaticMarkup(createElement(BrandArch, { className: 'h-72' }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('h-72');
    expect(html).toContain('#f4c66d'); // the gold half
  });

  it('marks a block heading with the yellow bar', () => {
    const html = renderToStaticMarkup(createElement(SectionTitle, null, 'My classes'));
    expect(html).toMatch(/^<h2[^>]*>.*bg-brand-yellow.*My classes<\/h2>$/);
  });
});
