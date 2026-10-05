/**
 * Writes the walkthrough id block into skills/agent-runtime/competitive-programming/SKILL.md
 * (ADR 0006 decision 6b).
 *
 * Usage: pnpm exec tsx scripts/generate-skill-catalog.ts [--check]
 *   --check  write nothing; exit 1 if the block in SKILL.md differs from the catalog.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { renderWalkthroughIdBlock, replaceWalkthroughIdBlock } from '@/lib/subjects/skill-block';

const skillPath = path.join(process.cwd(), 'skills/agent-runtime/competitive-programming/SKILL.md');
const current = readFileSync(skillPath, 'utf8');
const next = replaceWalkthroughIdBlock(current, renderWalkthroughIdBlock(SUBJECT_PACKS));

if (next === current) {
  console.log('skill catalog: up to date');
} else if (process.argv.includes('--check')) {
  console.error(
    'skill catalog: SKILL.md is out of date; run `pnpm exec tsx scripts/generate-skill-catalog.ts`',
  );
  process.exit(1);
} else {
  writeFileSync(skillPath, next);
  console.log('skill catalog: updated');
}
