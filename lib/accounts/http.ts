import type { AccountError, AccountErrorCode } from './service';

/** A JSON response with the given `Set-Cookie` values. */
export function jsonResponse(
  body: unknown,
  status: number,
  cookies: readonly string[] = [],
  headers: Record<string, string> = {},
): Response {
  const response = Response.json(body, { status, headers });
  for (const cookie of cookies) response.headers.append('Set-Cookie', cookie);
  return response;
}

/** The error shape the other `/api` routes use: `{ success, errorCode, error }`, plus `reason` when given. */
export function jsonError(
  status: number,
  errorCode: string,
  error: string,
  options: { reason?: string; headers?: Record<string, string> } = {},
): Response {
  return jsonResponse(
    { success: false, errorCode, error, ...(options.reason ? { reason: options.reason } : {}) },
    status,
    [],
    options.headers,
  );
}

/**
 * The client address for throttling: the last `X-Forwarded-For` entry, which the
 * nearest reverse proxy appends. Without the header the address is unknown and
 * no address-scoped throttle applies.
 */
export function clientAddress(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for');
  if (!forwarded) return undefined;
  const last = forwarded.split(',').pop()?.trim() ?? '';
  return /^[0-9A-Fa-f:.]{2,64}$/.test(last) ? last : undefined;
}

export function userAgentOf(headers: Headers): string | undefined {
  const value = headers.get('user-agent');
  return value ? value.slice(0, 200) : undefined;
}

/** The request body as a JSON object, or `undefined` when it is not one. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await req.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

const ACCOUNT_ERRORS: Record<AccountErrorCode, { status: number; message: string }> = {
  INVALID_USERNAME: { status: 400, message: 'the username is not allowed' },
  INVALID_DISPLAY_NAME: { status: 400, message: 'the display name must be 1 to 80 characters' },
  WEAK_PASSWORD: { status: 400, message: 'the password does not meet the policy' },
  NOT_FOUND: { status: 404, message: 'account not found' },
  USERNAME_TAKEN: { status: 409, message: 'the username is taken' },
  DELETED: { status: 409, message: 'deleted accounts cannot be changed' },
  LAST_ADMIN: { status: 409, message: 'at least one active admin must remain' },
};

/** The response for a refused account change. A taken username is not echoed back. */
export function accountErrorResponse(error: AccountError): Response {
  const { status, message } = ACCOUNT_ERRORS[error.code];
  return jsonError(status, error.code, message, {
    reason: error.code === 'USERNAME_TAKEN' ? undefined : error.reason,
  });
}
