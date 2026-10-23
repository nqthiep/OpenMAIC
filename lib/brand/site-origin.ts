import { DEFAULT_BRAND } from './brand-config';

/** The public origin of this deployment, the brand's domain when none is set. No trailing slash. */
export function siteOrigin(): string {
  return (process.env.PUBLIC_APP_ORIGIN || `https://${DEFAULT_BRAND.domain}`).replace(/\/+$/, '');
}

/** Pages worth indexing. The community needs a sign-in and is left out. */
export const INDEXABLE_PATHS = ['/', '/catalog', '/privacy', '/terms'] as const;

/** Paths a crawler has no use for: the API and the pages behind a sign-in. */
export const BLOCKED_PATHS = [
  '/api/',
  '/admin',
  '/workspace',
  '/workbench',
  '/generation-preview',
  '/eval',
] as const;

/**
 * Site-wide structured data: who publishes the site and what it is. A string safe to place inside
 * a `<script type="application/ld+json">`: `<` is escaped so no field can close the tag.
 */
export function siteJsonLd(): string {
  const origin = siteOrigin();
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: DEFAULT_BRAND.productName,
        url: origin,
        logo: `${origin}/icon.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: DEFAULT_BRAND.productName,
        url: origin,
        inLanguage: 'vi',
        description: DEFAULT_BRAND.description,
        publisher: { '@id': `${origin}/#organization` },
      },
    ],
  });
  return json.replace(/</g, '\\u003c');
}
