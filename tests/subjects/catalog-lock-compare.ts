/**
 * Pure comparison of `catalog-lock.json` against the current catalog (ADR 0013 decision 6).
 * Test-only helper; no I/O.
 */

export interface LockEntry {
  readonly entryRev: number;
  readonly contentHash: string;
  /** preset id → locale → hash */
  readonly framesHash: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** entry id → lock entry */
export type CatalogLock = Readonly<Record<string, LockEntry>>;

export type LockProblemKind =
  | 'removed' // id in lock, gone from catalog
  | 'new' // id in catalog, not in lock
  | 'hash-changed' // a hash differs but entryRev did not move
  | 'rev-bumped' // entryRev grew, lock not refreshed
  | 'rev-decreased'; // entryRev went backwards

export interface LockProblem {
  readonly kind: LockProblemKind;
  readonly id: string;
  readonly message: string;
  /** `UPDATE_CATALOG_LOCK=1` may resolve it by rewriting the lock. */
  readonly updatable: boolean;
}

/** Flatten hashes to `contentHash` / `framesHash/<preset>/<locale>` keys. */
function flatten(e: LockEntry): Map<string, string> {
  const m = new Map<string, string>([['contentHash', e.contentHash]]);
  for (const [preset, byLocale] of Object.entries(e.framesHash)) {
    for (const [locale, h] of Object.entries(byLocale)) m.set(`framesHash/${preset}/${locale}`, h);
  }
  return m;
}

function changedKeys(a: LockEntry, b: LockEntry): string[] {
  const fa = flatten(a);
  const fb = flatten(b);
  return [...new Set([...fa.keys(), ...fb.keys()])].filter((k) => fa.get(k) !== fb.get(k)).sort();
}

export function compareCatalogLock(lock: CatalogLock, current: CatalogLock): LockProblem[] {
  const problems: LockProblem[] = [];
  const ids = [...new Set([...Object.keys(lock), ...Object.keys(current)])].sort();
  for (const id of ids) {
    const was = lock[id];
    const now = current[id];
    if (was && !now) {
      problems.push({
        kind: 'removed',
        id,
        message: `${id}: in lock but gone from catalog (released ids must not be removed or renamed)`,
        updatable: true,
      });
    } else if (!was && now) {
      problems.push({
        kind: 'new',
        id,
        message: `${id}: not in lock yet (run with UPDATE_CATALOG_LOCK=1)`,
        updatable: true,
      });
    } else if (was && now) {
      if (now.entryRev < was.entryRev) {
        problems.push({
          kind: 'rev-decreased',
          id,
          message: `${id}: entryRev went down ${was.entryRev} -> ${now.entryRev}`,
          updatable: false,
        });
      } else if (now.entryRev > was.entryRev) {
        problems.push({
          kind: 'rev-bumped',
          id,
          message: `${id}: entryRev ${was.entryRev} -> ${now.entryRev} but lock not updated (run with UPDATE_CATALOG_LOCK=1)`,
          updatable: true,
        });
      } else {
        const changed = changedKeys(was, now);
        if (changed.length) {
          problems.push({
            kind: 'hash-changed',
            id,
            message: `${id}: ${changed.join(', ')} changed but entryRev stayed ${now.entryRev} (bump entryRev)`,
            updatable: false,
          });
        }
      }
    }
  }
  return problems;
}
