/**
 * Diagnostic summaries of unexpected errors, for server logs, and the text a visitor may
 * see for a failure. Neither returns a message or stack text to a client, except the
 * visitor's own key case in visitorErrorText.
 */

/** A name or code is logged only when it is a plain token, so text from a message cannot ride along. */
const LOGGABLE_TOKEN = /^[A-Za-z0-9_.]{1,64}$/;

/** V8 indents each stack frame by four spaces. A message line cannot match this inside the frame section. */
const STACK_FRAME = /^ {4}at /;

/**
 * A diagnostic line for an unexpected error: name, string code, and the first stack
 * frame. The message is never included. The frame is read only after the stack's own
 * header, so a newline inside the message cannot pass for a frame.
 */
export function describeUnexpectedError(value: unknown): string {
  if (!(value instanceof Error)) return 'non-error value';
  const rawCode = (value as { code?: unknown }).code;
  const code = typeof rawCode === 'string' && LOGGABLE_TOKEN.test(rawCode) ? rawCode : 'none';
  const name = LOGGABLE_TOKEN.test(value.name) ? value.name : 'unknown';
  const header = value.message ? `${value.name}: ${value.message}` : value.name;
  const stack = value.stack ?? '';
  const afterHeader = stack.startsWith(header) ? stack.slice(header.length) : '';
  const frame =
    afterHeader
      .split('\n')
      .find((line) => STACK_FRAME.test(line))
      ?.trim() ?? 'frame unavailable';
  return `${name} code=${code} frame=${frame}`;
}

/** Shown to a visitor when the operator's key fails. The upstream text is logged on the server only. */
export const MODEL_FAILURE_TEXT = 'The model provider could not complete this request.';

/**
 * Text a visitor may see for a failure. With the operator's key, upstream text stays on
 * the server: the fallback is sent instead. With the visitor's own key, the message is theirs.
 */
export function visitorErrorText(error: unknown, managedKey: boolean, fallback: string): string {
  if (managedKey || !(error instanceof Error)) return fallback;
  return error.message;
}

/** The HTTP status of an upstream provider failure, when the SDK reports one. */
export function providerStatusOf(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null | undefined)?.statusCode;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Text for a provider failure a visitor can act on. The text is fixed: it never carries
 * upstream text, so it is safe with the operator's key too. Undefined for every other
 * status, and the caller keeps its own fallback.
 */
export function providerFailureText(
  status: number | undefined,
  managedKey: boolean,
): string | undefined {
  if (status === 402) {
    return managedKey
      ? 'The AI provider account has run out of balance. Ask the administrator to top it up.'
      : 'Your AI provider account has run out of balance. Top it up, then try again.';
  }
  if (status === 401 || status === 403) {
    return managedKey
      ? 'The AI provider rejected the server key. Ask the administrator to check it.'
      : 'Your AI provider rejected the API key. Check it in settings.';
  }
  return undefined;
}

/** Shown to a visitor when the operator's key is used and the provider refuses the content. */
export const CONTENT_BLOCKED_TEXT = 'The provider blocked this content under its safety policy.';

/**
 * A stream event as a visitor may see it. With the operator's key, an error event carries
 * the fixed text, because its message is upstream text. Other events pass unchanged.
 */
export function visitorStreamEvent<T extends { type: string }>(
  event: T,
  managedKey: boolean,
): T | { type: 'error'; data: { message: string } } {
  if (!managedKey || event.type !== 'error') return event;
  return { type: 'error', data: { message: MODEL_FAILURE_TEXT } };
}
