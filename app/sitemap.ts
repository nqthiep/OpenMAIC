import type { MetadataRoute } from 'next';
import { INDEXABLE_PATHS, siteOrigin } from '@/lib/brand/site-origin';

// ponytail: static pages only. Add the public preview courses once they have a text page of their own.
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return INDEXABLE_PATHS.map((path) => ({ url: origin + (path === '/' ? '' : path) }));
}
