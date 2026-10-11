import { createLogger } from '@/lib/logger';
import { apiError, type ApiErrorCode } from '@/lib/server/api-response';

import { PasswordWorkBusyError } from './password';
import { AccountError, type AccountErrorCode } from './service';

const log = createLogger('AccountsRoute');

/** Credentials are small. A larger body is refused before it is parsed. */
export const MAX_CREDENTIALS_BODY_BYTES = 4 * 1024;

const STATUS_BY_CODE: Record<AccountErrorCode, number> = {
  ACCOUNTS_NOT_CONFIGURED: 404,
  REGISTRATION_DISABLED: 403,
  USERNAME_INVALID: 400,
  PASSWORD_INVALID: 400,
  USERNAME_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  RATE_LIMITED: 429,
};

/**
 * Browsers send Sec-Fetch-Site. Only a request the browser reports as coming
 * from this exact origin may sign a visitor in or out. Same-site requests from
 * a sibling host are refused too, because a sibling can start a sign-in that
 * SameSite=Lax does not stop. Clients that send no header are not browsers and
 * are allowed through.
 */
export function isCrossSiteRequest(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  return site !== null && site !== 'same-origin';
}

export function crossSiteRefusal(): Response {
  return apiError('INVALID_REQUEST', 403, 'Account requests must come from this site');
}

export function accountsNotConfigured(): Response {
  return apiError(
    'ACCOUNTS_NOT_CONFIGURED',
    404,
    'Accounts are not available: server persistence is not configured',
  );
}

type JsonObjectRead =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response };

/**
 * Reads at most `maxBytes` of the body. A declared length over the cap is
 * refused before any byte is read, and a body that turns out larger is abandoned
 * as soon as it passes the cap. Returns undefined when the cap is exceeded.
 */
async function readBodyUpTo(request: Request, maxBytes: number): Promise<string | undefined> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) return undefined;
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Reads a JSON object body. The application/json requirement matters: an HTML
 * form cannot send that content type cross-site, so it cannot forge a sign-in.
 */
export async function readJsonObject(request: Request): Promise<JsonObjectRead> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return {
      ok: false,
      response: apiError('INVALID_REQUEST', 415, 'Request body must be application/json'),
    };
  }

  const text = await readBodyUpTo(request, MAX_CREDENTIALS_BODY_BYTES);
  if (text === undefined) {
    return { ok: false, response: apiError('INVALID_REQUEST', 413, 'Request body is too large') };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, response: apiError('INVALID_REQUEST', 400, 'Invalid JSON body') };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, response: apiError('INVALID_REQUEST', 400, 'JSON body must be an object') };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

/**
 * Maps an account failure to its HTTP response. Messages come from the service
 * and never contain the submitted password or any stored value.
 */
export function accountErrorResponse(error: AccountError): Response {
  const response = apiError(error.code as ApiErrorCode, STATUS_BY_CODE[error.code], error.message);
  if (error.retryAfterSeconds !== undefined) {
    response.headers.set('Retry-After', String(error.retryAfterSeconds));
  }
  return response;
}

/**
 * Runs an account route body. Every response is marked no-store, and unexpected
 * errors are logged by type only, so credentials and database text stay out of logs.
 */
export async function runAccountRoute(handler: () => Promise<Response>): Promise<Response> {
  let response: Response;
  try {
    response = await handler();
  } catch (error) {
    if (error instanceof AccountError) {
      response = accountErrorResponse(error);
    } else if (error instanceof PasswordWorkBusyError) {
      response = apiError('ACCOUNTS_BUSY', 503, 'Account service is busy. Try again shortly.');
      response.headers.set('Retry-After', '2');
    } else {
      log.error('Account request failed', error instanceof Error ? error.name : 'unknown error');
      response = apiError('INTERNAL_ERROR', 500, 'Internal server error');
    }
  }
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
