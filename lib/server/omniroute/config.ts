/**
 * OmniRoute, the optional LLM gateway the compose profile `omniroute` runs. An administrator opens
 * its dashboard from the Settings popup, on a separate origin that only this app can admit people
 * to. The settings come from the server environment, never from the database or the browser; a
 * missing or weak value switches the feature off instead of half-enabling it.
 */
export interface OmniRouteConfig {
  /** Origin of the dashboard as the browser sees it, without a trailing slash. */
  publicUrl: string;
  /** Signs the one-time tickets and the gate cookie. */
  gateSecret: string;
  /** The dashboard password. This app signs the administrator in with it, so nobody types it. */
  adminPassword: string;
  /** Where this app reaches the dashboard over the Docker network. */
  internalUrl: string;
  /** Where this app reaches OmniRoute's OpenAI-compatible API (its own port). */
  apiUrl: string;
}

const MIN_GATE_SECRET = 32;
const MIN_ADMIN_PASSWORD = 16;
const DEFAULT_INTERNAL_URL = 'http://omniroute:20128';
const DEFAULT_API_URL = 'http://omniroute:20129';

/** The origin of an http(s) URL that has no path, credentials, query or fragment. */
function plainOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    const bare = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
    return (url.protocol === 'https:' || url.protocol === 'http:') && bare ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function urlOrDefault(value: string | undefined, fallback: string): string | undefined {
  return value?.trim() ? plainOrigin(value) : fallback;
}

export function omnirouteConfig(
  env: Record<string, string | undefined> = process.env,
): OmniRouteConfig | undefined {
  const publicUrl = plainOrigin(env.OMNIROUTE_PUBLIC_URL);
  const internalUrl = urlOrDefault(env.OMNIROUTE_INTERNAL_URL, DEFAULT_INTERNAL_URL);
  const apiUrl = urlOrDefault(env.OMNIROUTE_API_URL, DEFAULT_API_URL);
  const gateSecret = env.OMNIROUTE_GATE_SECRET ?? '';
  const adminPassword = env.OMNIROUTE_ADMIN_PASSWORD ?? '';
  if (!publicUrl || !internalUrl || !apiUrl) return undefined;
  if (gateSecret.length < MIN_GATE_SECRET || adminPassword.length < MIN_ADMIN_PASSWORD) {
    return undefined;
  }
  return { publicUrl, gateSecret, adminPassword, internalUrl, apiUrl };
}

/** The names of the environment values that stop OmniRoute being set up. Names only, never values. */
export function missingOmnirouteEnv(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const missing: string[] = [];
  if (!plainOrigin(env.OMNIROUTE_PUBLIC_URL)) missing.push('OMNIROUTE_PUBLIC_URL');
  if ((env.OMNIROUTE_GATE_SECRET ?? '').length < MIN_GATE_SECRET)
    missing.push('OMNIROUTE_GATE_SECRET');
  if ((env.OMNIROUTE_ADMIN_PASSWORD ?? '').length < MIN_ADMIN_PASSWORD) {
    missing.push('OMNIROUTE_ADMIN_PASSWORD');
  }
  if (!urlOrDefault(env.OMNIROUTE_INTERNAL_URL, DEFAULT_INTERNAL_URL)) {
    missing.push('OMNIROUTE_INTERNAL_URL');
  }
  if (!urlOrDefault(env.OMNIROUTE_API_URL, DEFAULT_API_URL)) missing.push('OMNIROUTE_API_URL');
  return missing;
}
