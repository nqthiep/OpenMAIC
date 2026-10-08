/**
 * Is `ref` the address of a clip asset of this app: a prebuilt one (`/clips/<clip>-<hash>/<chapter>.mp4`) or one stored
 * after an on-demand render (`/api/clips/<sha256>.mp4`)? Both are content-hashed and immutable, same origin, so an export may
 * fetch them and put the bytes into the archive (card 3-S3): a classroom ZIP of a clip lesson is then self-contained.
 * Browser-safe: a pure function of the string.
 */
export function isClipAssetUrl(ref: string): boolean {
  if (ref.includes('..') || ref.includes('?') || ref.includes('#')) return false;
  return (
    /^\/clips\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.(mp4|png|json|vtt)$/.test(ref) ||
    /^\/api\/clips\/[0-9a-f]{64}\.(mp4|png|json|vtt)$/.test(ref)
  );
}
