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
