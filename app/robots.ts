import type { MetadataRoute } from 'next';
import { BLOCKED_PATHS, siteOrigin } from '@/lib/brand/site-origin';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...BLOCKED_PATHS] },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
