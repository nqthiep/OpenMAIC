import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUBJECT_PACKS } from '@/lib/subjects';
import {
  extractWalkthroughIdBlock,
  renderWalkthroughIdBlock,
  replaceWalkthroughIdBlock,
} from '@/lib/subjects/skill-block';
import { msg } from '@/lib/tutor/catalog/messages';
import type { SubjectPack } from '@/lib/widgets/types';

const SKILL_DIR = join(process.cwd(), 'skills/agent-runtime/competitive-programming');
const skillMd = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
const ids = SUBJECT_PACKS.flatMap((p) => p.walkthroughs.map((w) => w.id));

describe('competitive-programming SKILL.md', () => {
  it('walkthrough id block matches the catalog (run: pnpm exec tsx scripts/generate-skill-catalog.ts)', () => {
    expect(extractWalkthroughIdBlock(skillMd)).toBe(renderWalkthroughIdBlock(SUBJECT_PACKS));
  });

  it('lists every walkthrough id and preset id', () => {
    const block = extractWalkthroughIdBlock(skillMd) ?? '';
    for (const w of SUBJECT_PACKS.flatMap((p) => p.walkthroughs)) {
      expect(block).toContain(`\`${w.id}\``);
      for (const preset of w.presets) expect(block).toContain(`\`${preset.id}\``);
    }
  });

  it('has the minimal frontmatter and the base rules', () => {
    expect(skillMd).toMatch(/^---\nname: competitive-programming\n/);
    expect(skillMd).toMatch(/\ntitle: "[^"]*[一-鿿]/);
    expect(skillMd).toContain('generate_walkthrough');
    expect(skillMd).toContain('lessonKit');
  });

  it('outline-constraints.json matches Phase 2 SCHEMA 4.2', () => {
    const c = JSON.parse(readFileSync(join(SKILL_DIR, 'outline-constraints.json'), 'utf8'));
    expect(c).toMatchObject({
      allowedTypes: ['slide', 'quiz', 'interactive'],
      firstSceneType: 'slide',
    });
    // The repo forbids page caps in skill constraints (tests/agent-runtime/skills.test.ts).
    expect(c).not.toHaveProperty('sceneCount');
    // ADR 0006 decision 6: these would wrongly flag LLM-generated widgets.
    for (const key of ['typeMix', 'allowedWidgetTypes', 'requiredWidgetOutlineFields']) {
      expect(c).not.toHaveProperty(key);
    }
  });
});

describe('renderWalkthroughIdBlock', () => {
  it('is deterministic and independent of pack order', () => {
    const reversed = [...SUBJECT_PACKS].reverse();
    expect(renderWalkthroughIdBlock(reversed)).toBe(renderWalkthroughIdBlock(SUBJECT_PACKS));
    expect(renderWalkthroughIdBlock(SUBJECT_PACKS)).toBe(renderWalkthroughIdBlock(SUBJECT_PACKS));
  });

  it('has a header, a separator and one row per walkthrough, sorted by id', () => {
    const rows = renderWalkthroughIdBlock(SUBJECT_PACKS).split('\n');
    expect(rows).toHaveLength(2 + ids.length);
    const rowIds = rows.slice(2).map((r) => /^\| `([^`]+)`/.exec(r)?.[1]);
    expect(rowIds).toEqual([...ids].sort());
  });

  it('uses the requested locale for titles, falling back to en-US', () => {
    const entry = SUBJECT_PACKS[0].walkthroughs[0];
    expect(renderWalkthroughIdBlock(SUBJECT_PACKS, 'vi-VN')).toContain(msg(entry.title, 'vi-VN'));
    expect(renderWalkthroughIdBlock(SUBJECT_PACKS, 'xx-XX')).toContain(msg(entry.title, 'en-US'));
  });

  it('keeps a title with a pipe or a line break on one row', () => {
    const base = SUBJECT_PACKS[0].walkthroughs[0];
    const pack: SubjectPack = {
      id: 'x',
      skillId: 'x',
      walkthroughs: [{ ...base, title: { 'en-US': 'a | b\nc' } }],
    };
    const rows = renderWalkthroughIdBlock([pack]).split('\n');
    expect(rows).toHaveLength(3);
    expect(rows[2]).toContain('a \\| b c');
  });
});

describe('replaceWalkthroughIdBlock', () => {
  it('round-trips and only touches the block', () => {
    const block = renderWalkthroughIdBlock(SUBJECT_PACKS);
    expect(replaceWalkthroughIdBlock(skillMd, block)).toBe(skillMd);
    const changed = replaceWalkthroughIdBlock(skillMd, 'X');
    expect(extractWalkthroughIdBlock(changed)).toBe('X');
    expect(changed.split('<!-- BEGIN GENERATED')[0]).toBe(skillMd.split('<!-- BEGIN GENERATED')[0]);
  });

  it('throws when the markers are missing', () => {
    expect(() => replaceWalkthroughIdBlock('no markers', 'X')).toThrow();
    expect(extractWalkthroughIdBlock('no markers')).toBeNull();
  });
});
