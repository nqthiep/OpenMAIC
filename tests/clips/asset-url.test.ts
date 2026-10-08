import { describe, expect, it } from 'vitest';
import { isClipAssetUrl } from '@/lib/clips/asset-url';

const sha = 'a'.repeat(64);

describe('isClipAssetUrl', () => {
  it('accepts the two shapes of clip assets', () => {
    expect(isClipAssetUrl('/clips/amgm-semicircle-68ac9f42cee0/setup.mp4')).toBe(true);
    expect(isClipAssetUrl('/clips/amgm-semicircle-68ac9f42cee0/setup.png')).toBe(true);
    expect(isClipAssetUrl(`/api/clips/${sha}.mp4`)).toBe(true);
  });

  it('refuses everything else: other origins, traversal, queries, other paths, pool ids', () => {
    for (const v of [
      'https://evil.example/clips/a/b.mp4',
      '//evil.example/clips/a/b.mp4',
      '/clips/../etc/passwd.mp4',
      '/clips/a/b.mp4?x=1',
      '/clips/a/b.exe',
      '/clips/a/b/c.mp4',
      `/api/clips/${sha}.exe`,
      '/api/clips/short.mp4',
      '/api/classroom-media/s/x.mp4',
      'gen_vid_1',
      '',
    ])
      expect(isClipAssetUrl(v), v).toBe(false);
  });
});
