import type { OmniRouteDeepLinks } from './contract';

/** Pages of OmniRoute's own dashboard that the Settings panel can open. */
export const DEEP_LINKS: OmniRouteDeepLinks = {
  providers: '/dashboard/providers',
  combos: '/dashboard/combos',
  keys: '/dashboard/api-manager',
  health: '/dashboard/health',
};

const ALLOWED_PATHS = new Set<string>(Object.values(DEEP_LINKS));

/** The path if it is one of `DEEP_LINKS`; anything else (including a made-up one) is not. */
export function allowedDeepLink(path: unknown): string | undefined {
  return typeof path === 'string' && ALLOWED_PATHS.has(path) ? path : undefined;
}
