/**
 * Messages a user can read are Vietnamese and generic: the 401 for a refused
 * owner credential, and the proxy-media failure that the media loader relays.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProxiedMediaUrl, resetProxyMediaFailureCache } from '@/lib/media/proxy-media-cache';
import { invalidOwnerCredentialResponse } from '@/lib/server/identity/with-owner';

describe('invalid owner credential response', () => {
  it('answers 401 INVALID_CREDENTIAL with a Vietnamese message', async () => {
    const response = invalidOwnerCredentialResponse();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'INVALID_CREDENTIAL',
        message: 'Thông tin xác thực không hợp lệ, vui lòng tải lại trang và thử lại.',
      },
    });
  });
});

describe('proxied media failure', () => {
  beforeEach(() => {
    resetProxyMediaFailureCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('relays an upstream failure as a Vietnamese message, without the upstream status text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const response = await fetchProxiedMediaUrl('https://example.com/missing-asset.png');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'UPSTREAM_ERROR',
      error: 'Nguồn không trả về tệp đa phương tiện.',
    });
  });
});
