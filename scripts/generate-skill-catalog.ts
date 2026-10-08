/**
 * Writes the generated walkthrough id table (markers `walkthrough-ids`) into each subject skill's SKILL.md
 * (ADR 0006 decision 6b). A pack's skill is `skills/agent-runtime/<pack.skillId>/SKILL.md` and lists only that pack's entries.
 *
 * Usage: pnpm exec tsx scripts/generate-skill-catalog.ts [--check]
 *   --check  write nothing; exit 1 if a block in a SKILL.md differs from the catalog.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SUBJECT_PACKS } from '@/lib/subjects';
import {
  WALKTHROUGH_IDS_BEGIN,
  renderWalkthroughIdBlock,
  replaceWalkthroughIdBlock,
} from '@/lib/subjects/skill-block';

const check = process.argv.includes('--check');
let stale = false;
let updated = false;
for (const pack of SUBJECT_PACKS) {
  const skillPath = path.join(process.cwd(), 'skills/agent-runtime', pack.skillId, 'SKILL.md');
  const current = readFileSync(skillPath, 'utf8');
  const next = replaceWalkthroughIdBlock(current, renderWalkthroughIdBlock([pack]));
  if (!current.includes(WALKTHROUGH_IDS_BEGIN))
    throw new Error(`${skillPath}: no walkthrough-ids block`);
  if (next === current) continue;
  if (check) {
    console.error(`skill catalog: ${skillPath} is out of date`);
    stale = true;
  } else {
    writeFileSync(skillPath, next);
    updated = true;
    console.log(`skill catalog: updated ${pack.skillId}`);
  }
}
if (stale) {
  console.error('run `pnpm exec tsx scripts/generate-skill-catalog.ts`');
  process.exit(1);
}
if (!updated) console.log('skill catalog: up to date');
