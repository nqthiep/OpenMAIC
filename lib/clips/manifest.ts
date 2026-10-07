/**
 * The manifest.json a rendered clip carries (DATA-MODEL §4) and its check against the catalog (task 3A-07). The scene
 * writes, besides the files of the chapters, the numbers it drew in `display`; `checkManifest` compares them with
 * `expectedDisplay`, the pure TypeScript recomputation, so a template that draws a wrong number is caught.
 */
import type { AnyClipEntry } from '@/lib/clips/types';

export interface ClipManifest {
  clipId: string;
  contentHash?: string;
  engineVersion?: string;
  templateRev: number;
  imageDigest?: string;
  profile?: string;
  w: number;
  h: number;
  fps: number;
  durationSec: number;
  chapters: {
    id: string;
    file: string;
    posterFile: string;
    startSec: number;
    endSec: number;
    sizeBytes?: number;
  }[];
  master?: { file: string; sizeBytes?: number };
  /** the numbers the scene displayed, by the keys of `expectedDisplay` */
  display: Record<string, number>;
}

/** A rendered chapter may differ from the planned one by this fraction of its length. */
export const LENGTH_TOLERANCE = 0.05;
/** Numbers the scene drew may differ from the recomputation by this much (the scene prints rounded values). */
export const DISPLAY_TOLERANCE = 1e-3;

/** Problems of `manifest` for `entry` and the expected display of one preset; empty when it is consistent. */
export function checkManifest(
  entry: AnyClipEntry,
  expected: Readonly<Record<string, number>>,
  manifest: unknown,
  tolerance: number = DISPLAY_TOLERANCE,
): string[] {
  if (manifest === null || typeof manifest !== 'object') return ['manifest is not an object'];
  const m = manifest as Partial<ClipManifest>;
  const problems: string[] = [];
  if (m.clipId !== entry.id) problems.push(`clipId is ${String(m.clipId)}, want ${entry.id}`);
  if (m.templateRev !== entry.engine.templateRev) {
    problems.push(`templateRev is ${String(m.templateRev)}, want ${entry.engine.templateRev}`);
  }
  if (m.w !== entry.render.w || m.h !== entry.render.h || m.fps !== entry.render.fps) {
    problems.push(
      `render profile is ${m.w}x${m.h}@${m.fps}, want ${entry.render.w}x${entry.render.h}@${entry.render.fps}`,
    );
  }

  const chapters = Array.isArray(m.chapters) ? m.chapters : [];
  const ids = chapters.map((c) => c.id);
  const want = entry.chapters.map((c) => c.id);
  if (ids.join(',') !== want.join(',')) {
    problems.push(`chapters are [${ids.join(', ')}], want [${want.join(', ')}]`);
  } else {
    entry.chapters.forEach((planned, i) => {
      const got = chapters[i];
      const plannedLen = planned.endSec - planned.startSec;
      const gotLen = got.endSec - got.startSec;
      if (!(Math.abs(gotLen - plannedLen) <= LENGTH_TOLERANCE * plannedLen)) {
        problems.push(
          `chapter ${planned.id} is ${gotLen}s, planned ${plannedLen}s (more than 5% apart)`,
        );
      }
    });
  }

  const display = m.display && typeof m.display === 'object' ? m.display : {};
  const gotKeys = Object.keys(display).sort();
  const wantKeys = Object.keys(expected).sort();
  if (gotKeys.join(',') !== wantKeys.join(',')) {
    problems.push(`display keys are [${gotKeys.join(', ')}], want [${wantKeys.join(', ')}]`);
  } else {
    for (const k of wantKeys) {
      const v = display[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v - expected[k]) > tolerance) {
        problems.push(`display ${k} is ${String(v)}, want ${expected[k]} (within ${tolerance})`);
      }
    }
  }
  return problems;
}
