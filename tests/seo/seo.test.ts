import { createElement } from 'react';
import { prerender } from 'react-dom/static';
import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { HomeSeoContent } from '@/components/home/home-seo-content';
import { siteJsonLd, siteOrigin } from '@/lib/brand/site-origin';
import { I18nProvider } from '@/lib/hooks/use-i18n';

describe('crawler files', () => {
  it('robots blocks the API and the pages behind a sign-in, and names the sitemap', () => {
    const { rules, sitemap: url } = robots();
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule.disallow).toEqual(expect.arrayContaining(['/api/', '/admin', '/workspace']));
    expect(url).toBe(`${siteOrigin()}/sitemap.xml`);
  });

  it('sitemap lists absolute URLs and leaves out the community', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(siteOrigin());
    expect(urls).toContain(`${siteOrigin()}/catalog`);
    expect(urls.every((url) => url.startsWith('https://') || url.startsWith('http://'))).toBe(true);
    expect(urls.some((url) => url.includes('community'))).toBe(false);
  });
});

describe('structured data', () => {
  it('is JSON that cannot close its script tag', () => {
    const text = siteJsonLd();
    expect(text).not.toContain('<');
    const data = JSON.parse(text);
    expect(data['@graph'].map((node: { '@type': string }) => node['@type'])).toEqual([
      'Organization',
      'WebSite',
    ]);
  });
});

describe('home text for crawlers', () => {
  it('server HTML carries one h1 and the guest copy before any script runs', async () => {
    // `prerender` waits for the translations to load, which `renderToString` cannot.
    const { prelude } = await prerender(
      createElement(I18nProvider, null, createElement(HomeSeoContent)),
    );
    const html = await new Response(prelude).text();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Học đến đâu');
    expect(html).toContain('href="/catalog"');
  });
});
