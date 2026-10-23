/**
 * OmniRoute, the LLM gateway that runs beside this app as its own compose service. An
 * administrator opens its dashboard from the Settings popup, on a separate origin that only this app
 * can admit people to. Nothing here has to be typed in: the compose service `omniroute-init` makes
 * the dashboard password once and both services read it from a shared volume. The environment only
 * overrides, and a value that is set but unusable switches the feature off instead of half-enabling it.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface OmniRouteConfig {
  /**
   * Origin of the dashboard as the browser sees it, without a trailing slash. Only set when
   * `OMNIROUTE_PUBLIC_URL` is; otherwise it is worked out from the page the administrator is on.
   */
  publicUrl?: string;
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
const PASSWORD_FILE = 'admin_password';
/** Where compose mounts the volume that `omniroute-init` fills. */
const SECRETS_DIR = '/run/omniroute';
/** With `next dev` outside Docker: `ops/omniroute/host-dev.yml` writes here and publishes the ports. */
const HOST_DEV_SECRETS_DIR = join('.omniroute', 'secrets');
const COMPOSE_URLS = { internal: 'http://omniroute:20128', api: 'http://omniroute:20129' };
const HOST_DEV_URLS = { internal: 'http://127.0.0.1:20128', api: 'http://127.0.0.1:20129' };

type Env = Record<string, string | undefined>;
type ReadFile = (path: string) => string | undefined;

const readSecretFile: ReadFile = (path) => {
  try {
    return readFileSync(path, 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
};

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

/** Where the dashboard password may be: the variable's folder alone, or the compose mount (and, in dev, the host folder). */
function secretDirs(env: Env): string[] {
  if (env.OMNIROUTE_SECRETS_DIR?.trim()) return [env.OMNIROUTE_SECRETS_DIR.trim()];
  return env.NODE_ENV === 'development'
    ? [SECRETS_DIR, join(process.cwd(), HOST_DEV_SECRETS_DIR)]
    : [SECRETS_DIR];
}

/**
 * Not kept on a request-by-request basis: one random value per process. A restart ends the open
 * dashboard sessions and the administrator clicks "open" again, which is why it needs no storage.
 */
const processSecret = globalThis as { __omnirouteGateSecret?: string };
const ownGateSecret = (): string =>
  (processSecret.__omnirouteGateSecret ??= randomBytes(48).toString('base64'));

interface Resolved {
  config?: OmniRouteConfig;
  /** Values that are set but unusable. A value that is simply absent is not listed. */
  invalid: string[];
}

function resolve(env: Env, readFile: ReadFile): Resolved {
  const invalid: string[] = [];
  const set = (name: string) => (env[name] ?? '').trim() !== '';

  const publicUrl = plainOrigin(env.OMNIROUTE_PUBLIC_URL);
  if (set('OMNIROUTE_PUBLIC_URL') && !publicUrl) invalid.push('OMNIROUTE_PUBLIC_URL');

  const gateSecret = env.OMNIROUTE_GATE_SECRET ?? '';
  if (set('OMNIROUTE_GATE_SECRET') && gateSecret.length < MIN_GATE_SECRET) {
    invalid.push('OMNIROUTE_GATE_SECRET');
  }

  const fromEnv = env.OMNIROUTE_ADMIN_PASSWORD ?? '';
  if (set('OMNIROUTE_ADMIN_PASSWORD') && fromEnv.length < MIN_ADMIN_PASSWORD) {
    invalid.push('OMNIROUTE_ADMIN_PASSWORD');
  }
  let adminPassword = set('OMNIROUTE_ADMIN_PASSWORD') ? fromEnv : undefined;
  let hostDev = false;
  if (!adminPassword) {
    for (const dir of secretDirs(env)) {
      const value = readFile(join(dir, PASSWORD_FILE));
      if (value && value.length >= MIN_ADMIN_PASSWORD) {
        adminPassword = value;
        hostDev = dir !== SECRETS_DIR && !env.OMNIROUTE_SECRETS_DIR?.trim();
        break;
      }
    }
  }

  const urls = hostDev ? HOST_DEV_URLS : COMPOSE_URLS;
  const internalUrl = set('OMNIROUTE_INTERNAL_URL')
    ? plainOrigin(env.OMNIROUTE_INTERNAL_URL)
    : urls.internal;
  if (!internalUrl) invalid.push('OMNIROUTE_INTERNAL_URL');
  const apiUrl = set('OMNIROUTE_API_URL') ? plainOrigin(env.OMNIROUTE_API_URL) : urls.api;
  if (!apiUrl) invalid.push('OMNIROUTE_API_URL');

  if (invalid.length > 0 || !adminPassword || !internalUrl || !apiUrl) return { invalid };
  return {
    invalid,
    config: {
      publicUrl,
      gateSecret: set('OMNIROUTE_GATE_SECRET') ? gateSecret : ownGateSecret(),
      adminPassword,
      internalUrl,
      apiUrl,
    },
  };
}

export function omnirouteConfig(
  env: Env = process.env,
  readFile: ReadFile = readSecretFile,
): OmniRouteConfig | undefined {
  return resolve(env, readFile).config;
}

/**
 * The names of environment values that are set but wrong. Names only, never values. Empty when
 * OmniRoute is simply not there yet (no password file): that is not something to type in.
 */
export function missingOmnirouteEnv(env: Env = process.env, readFile: ReadFile = readSecretFile) {
  return resolve(env, readFile).invalid;
}

/** The port the gate listens on at the host's loopback (compose `OMNIROUTE_GATE_PORT`). */
const gatePort = (env: Env): string =>
  /^\d{2,5}$/.test(env.OMNIROUTE_GATE_PORT ?? '') ? env.OMNIROUTE_GATE_PORT! : '8081';

const isLocalHost = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname === '127.0.0.1' ||
  hostname === '[::1]';

/**
 * The origin the administrator's browser must use to reach the dashboard. `OMNIROUTE_PUBLIC_URL`
 * wins. Otherwise it follows the page the administrator is on: `omniroute.` in front of its host
 * (`www.` dropped), or `http://omniroute.localhost:8081` while developing on localhost. `pageOrigin`
 * is the `Origin` of a same-site POST, so it names this site, never a third party.
 */
export function dashboardOrigin(
  config: Pick<OmniRouteConfig, 'publicUrl'>,
  pageOrigin: string | null,
  env: Env = process.env,
): string | undefined {
  if (config.publicUrl) return config.publicUrl;
  const page = plainOrigin(pageOrigin ?? undefined);
  if (!page) return undefined;
  const { protocol, hostname, host } = new URL(page);
  if (isLocalHost(hostname)) return `http://omniroute.localhost:${gatePort(env)}`;
  return `${protocol}//omniroute.${host.replace(/^www\./, '')}`;
}

/** Whether cookies for the dashboard get the `Secure` flag: anything but localhost is https. */
export function dashboardIsSecure(
  config: Pick<OmniRouteConfig, 'publicUrl'>,
  host: string | null,
): boolean {
  if (config.publicUrl) return config.publicUrl.startsWith('https:');
  const hostname = (host ?? '').replace(/:\d+$/, '').toLowerCase();
  return hostname !== '' && !isLocalHost(hostname);
}
