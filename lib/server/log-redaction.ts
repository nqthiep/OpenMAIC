/**
 * Log-safe text for provider errors. This module imports nothing, so lib/pdf
 * can depend on it without an import cycle.
 */

/**
 * Removes credential-looking text from a provider error body before it is
 * logged: the value of a secret-named field, a Bearer token, URL userinfo and
 * long opaque strings. Exported for unit testing.
 */
export function redactSecretsForLog(text: string): string {
  return (
    text
      .replace(
        /((?:authorization|api[_-]?key|private[_-]?key|token|secret|password|passwd)["']?\s*[:=]\s*["']?)(?:(?:bearer|basic)\s+)?[^\s"',;&}]+/gi,
        '$1[redacted]',
      )
      .replace(/\bbearer\s+[\w.~+/=-]+/gi, 'Bearer [redacted]')
      .replace(/\b([a-z][a-z\d]*:\/\/)[^\s/?#@]+@/gi, '$1[redacted]@')
      // ponytail: heuristic; a bare secret with '/' or '.' and no field name can leak in part.
      .replace(/[\w+=-]{32,}/g, '[redacted]')
  );
}

/** Scheme and host only: the query and userinfo of a URL can carry credentials. */
export function urlOriginForLog(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '[invalid URL]';
  }
}
