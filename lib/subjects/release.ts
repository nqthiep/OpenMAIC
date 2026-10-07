/**
 * Release gate (INTERFACES 8.2): with OPENMAIC_REQUIRE_REVIEW on, a catalog entry is exposed only
 * if `lib/subjects/<subject>/reviews/<entryId>@<entryRev>.json` holds two reviews that pass
 * `panelVerdict` AND a contentHash equal to the entry's current one (an edit invalidates the review).
 * Server-side only: reads the disk and hashes with node:crypto.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clipEntryHash } from '@/lib/clips/hash';
import { entryContentHash } from '@/lib/tutor/catalog/hash';
import { panelVerdict, parseReview, reviewPath } from '@/lib/tutor/review-schema';
import type { SubjectPack } from '@/lib/widgets/types';

/** Raw text of a review file, or null when it does not exist. Injectable for tests. */
export type ReviewLoader = (subject: string, entryId: string, entryRev: number) => string | null;

/**
 * Roots searched for `lib/subjects/<subject>/reviews/**`: the cwd first (repo root in dev/CI, the
 * standalone dir in Docker), then the repo root relative to this module (works when the cwd is not
 * the project dir). `__dirname` is absent in some bundles: then only the cwd is searched.
 */
function defaultReviewRoots(): string[] {
  const roots = [process.cwd()];
  if (typeof __dirname === 'string') roots.push(path.resolve(__dirname, '..', '..'));
  return roots;
}

export function makeDiskReviewLoader(roots: () => string[] = defaultReviewRoots): ReviewLoader {
  return (subject, entryId, entryRev) => {
    const rel = reviewPath(subject, entryId, entryRev);
    for (const root of roots()) {
      try {
        return readFileSync(path.join(root, rel), 'utf8');
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw e;
      }
    }
    return null;
  };
}

export const diskReviewLoader: ReviewLoader = makeDiskReviewLoader();

/** Stored shape: `{ "contentHash": "…", "reviews": [r1, r2] }` (the stored `verdict`, if any, is ignored). */
function isReleasedAs(
  subject: string,
  id: string,
  rev: number,
  hash: string,
  load: ReviewLoader,
): boolean {
  let stored: unknown;
  try {
    const raw = load(subject, id, rev);
    if (raw === null) return false;
    stored = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!stored || typeof stored !== 'object') return false;
  const { contentHash, reviews } = stored as { contentHash?: unknown; reviews?: unknown };
  if (contentHash !== hash) return false;
  if (!Array.isArray(reviews) || reviews.length !== 2) return false;
  const [r1, r2] = reviews.map((r) => parseReview(JSON.stringify(r)));
  if (!r1 || !r2) return false;
  if (r1.entryId !== id || r1.entryRev !== rev) return false;
  return panelVerdict(r1, r2) === 'pass';
}

/** The packs with only the entries (walkthroughs and clips) that have a passing review for their exact revision. */
export function releasedPacks(
  packs: readonly SubjectPack[],
  loadReview: ReviewLoader = diskReviewLoader,
): SubjectPack[] {
  return packs.map((pack) => ({
    ...pack,
    walkthroughs: pack.walkthroughs.filter((e) =>
      isReleasedAs(pack.id, e.id, e.entryRev, entryContentHash(e), loadReview),
    ),
    // a clip needs the same signed panel review, for its templateRev and its current content
    ...(pack.clips && {
      clips: pack.clips.filter((c) =>
        isReleasedAs(pack.id, c.id, c.engine.templateRev, clipEntryHash(c), loadReview),
      ),
    }),
  }));
}
