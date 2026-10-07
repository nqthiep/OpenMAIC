/**
 * Writes the generated id blocks into each subject skill's SKILL.md (ADR 0006 decision 6b): the walkthrough id
 * table (markers `walkthrough-ids`) and, when the file has the markers, the clip id table (`clip-ids`). A pack's
 * skill is `skills/agent-runtime/<pack.skillId>/SKILL.md` and lists only that pack's entries.
 *
 * Usage: pnpm exec tsx scripts/generate-skill-catalog.ts [--check]
 *   --check  write nothing; exit 1 if a block in a SKILL.md differs from the catalog.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SUBJECT_PACKS } from '@/lib/subjects';
import {
  CLIP_IDS_BEGIN,
  WALKTHROUGH_IDS_BEGIN,
  renderClipIdBlock,
  renderWalkthroughIdBlock,
  replaceClipIdBlock,
  replaceWalkthroughIdBlock,
} from '@/lib/subjects/skill-block';

const check = process.argv.includes('--check');
let stale = false;
let updated = false;
for (const pack of SUBJECT_PACKS) {
  const skillPath = path.join(process.cwd(), 'skills/agent-runtime', pack.skillId, 'SKILL.md');
  const current = readFileSync(skillPath, 'utf8');
  let next = replaceWalkthroughIdBlock(current, renderWalkthroughIdBlock([pack]));
  if (current.includes(CLIP_IDS_BEGIN)) next = replaceClipIdBlock(next, renderClipIdBlock([pack]));
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
