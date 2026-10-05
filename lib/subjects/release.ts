/**
 * Release gate (INTERFACES 8.2): with OPENMAIC_REQUIRE_REVIEW on, a catalog entry is exposed only
 * if `lib/subjects/<subject>/reviews/<entryId>@<entryRev>.json` holds two reviews that pass
 * `panelVerdict` AND a contentHash equal to the entry's current one (an edit invalidates the review).
 * Server-side only: reads the disk and hashes with node:crypto.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { entryContentHash } from '@/lib/tutor/catalog/hash';
import { panelVerdict, parseReview, reviewPath } from '@/lib/tutor/review-schema';
import type { SubjectPack } from '@/lib/widgets/types';

/** Raw text of a review file, or null when it does not exist. Injectable for tests. */
export type ReviewLoader = (subject: string, entryId: string, entryRev: number) => string | null;

export const diskReviewLoader: ReviewLoader = (subject, entryId, entryRev) => {
  try {
    return readFileSync(path.join(process.cwd(), reviewPath(subject, entryId, entryRev)), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
};

/** Stored shape: `{ "contentHash": "…", "reviews": [r1, r2] }` (the stored `verdict`, if any, is ignored). */
function isReleased(
  pack: SubjectPack,
  entry: SubjectPack['walkthroughs'][number],
  load: ReviewLoader,
): boolean {
  let stored: unknown;
  try {
    const raw = load(pack.id, entry.id, entry.entryRev);
    if (raw === null) return false;
    stored = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!stored || typeof stored !== 'object') return false;
  const { contentHash, reviews } = stored as { contentHash?: unknown; reviews?: unknown };
  if (contentHash !== entryContentHash(entry)) return false;
  if (!Array.isArray(reviews) || reviews.length !== 2) return false;
  const [r1, r2] = reviews.map((r) => parseReview(JSON.stringify(r)));
  if (!r1 || !r2) return false;
  if (r1.entryId !== entry.id || r1.entryRev !== entry.entryRev) return false;
  return panelVerdict(r1, r2) === 'pass';
}

/** The packs with only the entries that have a passing review for their exact entryRev. */
export function releasedPacks(
  packs: readonly SubjectPack[],
  loadReview: ReviewLoader = diskReviewLoader,
): SubjectPack[] {
  return packs.map((pack) => ({
    ...pack,
    walkthroughs: pack.walkthroughs.filter((e) => isReleased(pack, e, loadReview)),
  }));
}
