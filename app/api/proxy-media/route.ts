/**
 * Media Proxy API
 *
 * Server-side proxy for fetching remote media URLs (images/videos).
 * Required because browser fetch() to remote CDN URLs fails with CORS errors.
 * The media orchestrator uses this to download generated media as blobs
 * for IndexedDB persistence.
 *
 * POST /api/proxy-media
 * Body: { url: string }
 * Response: Binary blob with appropriate Content-Type
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Dispatcher } from 'undici';
import { findUnsafeNetworkTargetError, validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { createValidatedDispatcher } from '@/lib/server/pinned-dispatcher';
import { DownloadSizeLimitError, readResponseBodyWithLimit } from '@/lib/server/bounded-download';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('ProxyMedia');
const MAX_PROXY_BYTES = 25 * 1024 * 1024; // 25 MiB
// Media and font types that the media and export pipelines fetch. HTML, JSON,
// text and other types are refused so the proxy cannot relay them.
const ALLOWED_MEDIA_TYPE =
  /^(image|video|audio|font)\/[\w.+-]+$|^application\/(octet-stream|vnd\.ms-fontobject|(x-)?font-[\w-]+)$/;
// One message for every refused address; the reason stays in the server log.
const BLOCKED_URL_MESSAGE = 'Địa chỉ tệp không được phép truy cập.';

// The query and fragment are dropped from logged URLs: signed media links carry tokens.
function loggedUrl(url: string | undefined): string {
  return url?.split(/[?#]/)[0]?.substring(0, 100) ?? 'unknown';
}

export async function POST(request: NextRequest) {
  let url: string | undefined;
  let dispatcher: Dispatcher | undefined;
  try {
    ({ url } = await request.json());

    if (!url || typeof url !== 'string') {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Thiếu hoặc sai địa chỉ tệp (url).');
    }

    // Initial SSRF validation
    const ssrfError = await validateUrlForSSRF(url);
    if (ssrfError) {
      log.warn(`Proxy media refused [url="${loggedUrl(url)}"]: ${ssrfError}`);
      return apiError('INVALID_URL', 403, BLOCKED_URL_MESSAGE);
    }

    // Pin every connection to the exact address set the connect-time lookup
    // approved, closing the window where the HTTP client resolves the hostname
    // again and could reach an internal address after the guard saw a public one.
    dispatcher = createValidatedDispatcher();

    const MAX_REDIRECTS = 5;
    let currentUrl = url;
    let response: Response;
    // Node's global fetch is undici and accepts a `dispatcher`, which the DOM
    // RequestInit type does not model.
    const hopInit: RequestInit & { dispatcher: Dispatcher } = {
      redirect: 'manual',
      dispatcher,
    };
    for (let hop = 0; ; hop++) {
      response = await fetch(currentUrl, hopInit);
      if (response.status < 300 || response.status >= 400) break; // not a redirect
      const location = response.headers.get('location');
      if (!location)
        return apiError('UPSTREAM_ERROR', 502, 'Nguồn chuyển hướng nhưng không có địa chỉ đích.');
      if (hop >= MAX_REDIRECTS)
        return apiError('TOO_MANY_REDIRECTS', 502, 'Quá nhiều lần chuyển hướng.');
      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).href; // resolve relative redirects
      } catch {
        return apiError('INVALID_URL', 502, 'Địa chỉ chuyển hướng không hợp lệ.');
      }
      // Re-validate each redirect hop to prevent redirect-to-internal SSRF (#398)
      const hopError = await validateUrlForSSRF(nextUrl);
      if (hopError) {
        log.warn(`Proxy media redirect refused [url="${loggedUrl(nextUrl)}"]: ${hopError}`);
        return apiError('INVALID_URL', 403, BLOCKED_URL_MESSAGE);
      }
      currentUrl = nextUrl;
    }

    if (!response!.ok) {
      // Forward client (4xx) errors as-is so the caller treats them as permanent
      // (no retry); collapse upstream server (5xx) errors to 502.
      const status = response!.status >= 400 && response!.status < 500 ? response!.status : 502;
      log.warn(`Upstream returned ${response!.status} [url="${loggedUrl(currentUrl)}"]`);
      return apiError('UPSTREAM_ERROR', status, 'Nguồn không trả về tệp đa phương tiện.');
    }

    const contentType = response!.headers.get('content-type') || 'application/octet-stream';
    const mediaType = (contentType.split(';')[0] ?? '').trim().toLowerCase();
    if (!ALLOWED_MEDIA_TYPE.test(mediaType)) {
      // A 4xx is permanent for the client's negative cache, so it is not retried.
      return apiError('UPSTREAM_ERROR', 415, 'Nguồn không phải tệp đa phương tiện được hỗ trợ');
    }
    // Reads the body as a stream and cancels it past the cap, so an oversized
    // asset is never buffered whole.
    let bytes: Buffer;
    try {
      bytes = await readResponseBodyWithLimit(response!, { maxBytes: MAX_PROXY_BYTES });
    } catch (error) {
      if (error instanceof DownloadSizeLimitError) {
        // 413 is a permanent 4xx for the client's negative cache, so it is not retried.
        return apiError('UPSTREAM_ERROR', 413, 'Tệp đa phương tiện vượt quá 25 MB');
      }
      throw error;
    }

    // Buffer.concat allocates an ArrayBuffer, so the narrower view type is accurate.
    return new NextResponse(bytes as Uint8Array<ArrayBuffer>, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    // A connect-time refusal from the pinned dispatcher is the same SSRF policy
    // the URL-layer guard enforces, so report it as an invalid URL (403), not
    // as an internal error (undici wraps the lookup error as `fetch failed`).
    const blocked = findUnsafeNetworkTargetError(error);
    if (blocked) {
      log.warn(`Proxy media refused at connect [url="${loggedUrl(url)}"]: ${blocked.message}`);
      return apiError('INVALID_URL', 403, BLOCKED_URL_MESSAGE);
    }
    log.error(`Proxy media failed [url="${loggedUrl(url)}"]:`, error);
    return apiError('INTERNAL_ERROR', 500, 'Không thể tải tệp đa phương tiện, vui lòng thử lại.');
  } finally {
    // The response bytes (if any) are already fully in memory here, so tear the
    // pool down immediately instead of draining it. `close()` waits for
    // in-flight requests, and the response body is intentionally left unread on
    // the 30x, non-2xx, unsupported-type, oversize and connect-refusal paths, so
    // awaiting it would hang the handler until the upstream ends a body nobody reads.
    void dispatcher?.destroy().catch(() => undefined);
  }
}
