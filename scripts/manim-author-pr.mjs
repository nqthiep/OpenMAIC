/**
 * Opens one pull request per template that the author loop produced (card 3D-02, ADR 0014 decision 4).
 *
 *   node scripts/manim-author-pr.mjs <dir> [--dry-run]
 *
 * <dir> holds, per clip, <clip_id>.py and <clipId>.gates.json (written by `eval/manim-author/runner.ts --out <dir>`):
 *   { allowlist, render, manifest, mathReview, codeReview }   each true, false or null (not run)
 * Auto-merge is switched on ONLY when all five are true (the four conditions of the card; render and QA count once each
 * through `render`). Anything else opens the PR as a draft with the gate table, and nothing merges by itself.
 * This script is the only step that holds write tokens; the step that wrote the code did not (see the workflow).
 * [Unverified] never run against GitHub: --dry-run prints what it would do.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const GATES = ['allowlist', 'render', 'manifest', 'mathReview', 'codeReview'];

/** `{ autoMerge, draft, missing }` for one gates object. Only an explicit `true` counts as a pass. */
export function decide(gates) {
  const missing = GATES.filter((g) => gates?.[g] !== true);
  return { autoMerge: missing.length === 0, draft: missing.length > 0, missing };
}

export function prBody(gates, d) {
  const mark = (v) => (v === true ? 'pass' : v === false ? 'FAIL' : 'not run');
  return [
    `Template written by the manim-author loop for \`${gates.clipId}\` (brief \`${gates.briefId}\`, solved in round ${gates.rounds}).`,
    '',
    '| Gate | Result |',
    '| --- | --- |',
    ...GATES.map((g) => `| ${g} | ${mark(gates[g])} |`),
    '',
    d.autoMerge
      ? 'All gates passed: auto-merge is on.'
      : `Not mergeable by itself: ${d.missing.join(', ')} did not pass. A person decides.`,
  ].join('\n');
}

function run(cmd, args, dry) {
  if (dry) {
    console.log(`$ ${cmd} ${args.join(' ')}`);
    return { status: 0, stdout: '' };
  }
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
  return r;
}

function main() {
  const dir = process.argv[2];
  const dry = process.argv.includes('--dry-run');
  if (!dir || !existsSync(dir)) {
    console.error('usage: node scripts/manim-author-pr.mjs <dir> [--dry-run]');
    return 2;
  }
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.gates.json'))) {
    const gates = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    const d = decide(gates);
    const stem = gates.clipId.replace(/-/g, '_');
    const branch = `manim-author/${gates.clipId}`;
    const body = prBody(gates, d);
    run('git', ['switch', '-c', branch], dry);
    if (!dry) copyFileSync(path.join(dir, `${stem}.py`), `manim/templates/${stem}.py`);
    run('git', ['add', `manim/templates/${stem}.py`], dry);
    run(
      'git',
      ['commit', '-m', `feat(clips): manim template for ${gates.clipId} (author loop)`],
      dry,
    );
    run('git', ['push', '-u', 'origin', branch], dry);
    run(
      'gh',
      [
        'pr',
        'create',
        '--title',
        `Manim template: ${gates.clipId}`,
        '--body',
        body,
        ...(d.draft ? ['--draft'] : []),
      ],
      dry,
    );
    if (d.autoMerge) run('gh', ['pr', 'merge', '--auto', '--squash', branch], dry);
    else console.log(`${gates.clipId}: draft PR, no auto-merge (${d.missing.join(', ')})`);
    run('git', ['switch', '-'], dry);
  }
  return 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
)
  process.exit(main());
