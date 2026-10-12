/**
 * Reads a JSON request body with a byte cap.
 *
 * A declared Content-Length above the cap is refused before any byte is read. The
 * bytes actually received are counted as well, so a chunked body without a length
 * header is capped too. A body over the cap is cancelled, not buffered.
 */
export type BoundedJsonResult =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false;
      readonly status: 400 | 413;
      readonly code: 'INVALID_JSON' | 'PAYLOAD_TOO_LARGE';
    };

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<BoundedJsonResult> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) {
    return { ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE' };
  }
  if (!request.body) return { ok: false, status: 400, code: 'INVALID_JSON' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE' };
    }
    chunks.push(value);
  }

  try {
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, code: 'INVALID_JSON' };
  }
}
