/**
 * Splits docs/tutor/curriculum/curriculum-math-vn.json into
 * skills/agent-runtime/olympiad-math/references/curriculum/
 * {tier-1..tier-4.json, index.json} (Phase 3 task 3B-00; same as split-curriculum.ts, plus `primary_medium` in index.json).
 *
 * Usage: pnpm exec tsx scripts/split-curriculum-math.ts [--check]
 *   --check  write nothing; exit 1 if the output files differ from a fresh split.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format } from 'prettier';

export const MATH_CURRICULUM_SRC = 'docs/tutor/curriculum/curriculum-math-vn.json';
export const MATH_CURRICULUM_OUT = 'skills/agent-runtime/olympiad-math/references/curriculum';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

/** Recursively sorts object keys (arrays keep their order) so the output is deterministic. */
function sortKeys(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Obj = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

// Run through prettier so `pnpm check` (prettier . --check) accepts the generated files.
const stringify = (value: Json) =>
  format(JSON.stringify(sortKeys(value), null, 2), { parser: 'json', printWidth: 100 });

/** Returns `{ fileName: content }` for the four tier files and `index.json`. */
export async function splitCurriculum(sourceText: string): Promise<Record<string, string>> {
  const src = JSON.parse(sourceText) as Obj;
  const tiers = src.tiers as Obj[];
  const files: Record<string, string> = {};
  const topics: Json[] = [];
  for (const tier of tiers) {
    const tierNo = tier.order as number;
    files[`tier-${tierNo}.json`] = await stringify(tier);
    for (const t of tier.topics as Obj[]) {
      topics.push({
        id: t.id,
        name_vi: t.name_vi,
        name_en: t.name_en,
        tier: tierNo,
        primary_medium: t.primary_medium,
        difficulty: t.difficulty,
        prerequisites: t.prerequisites,
      });
    }
  }
  files['index.json'] = await stringify({
    course_shape: src.course_shape,
    sequencing: src.sequencing,
    topics,
  });
  return files;
}

async function main() {
  const cwd = process.cwd();
  const files = await splitCurriculum(readFileSync(path.join(cwd, MATH_CURRICULUM_SRC), 'utf8'));
  const outDir = path.join(cwd, MATH_CURRICULUM_OUT);
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([name, content]) => {
      const file = path.join(outDir, name);
      return !existsSync(file) || readFileSync(file, 'utf8') !== content;
    });
    if (stale.length) {
      console.error(`curriculum split out of date: ${stale.map(([n]) => n).join(', ')}`);
      process.exit(1);
    }
    console.log('curriculum split: up to date');
    return;
  }
  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files))
    writeFileSync(path.join(outDir, name), content);
  console.log(`curriculum split: wrote ${Object.keys(files).length} files`);
}

// Only run when invoked directly, so the test can import `splitCurriculum`.
if (process.argv[1]?.endsWith('split-curriculum-math.ts')) void main();
