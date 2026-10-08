import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  authorOne,
  buildAuthorPrompt,
  buildAuthorSystem,
  extractPython,
  summarise,
  type Brief,
  type BriefResult,
} from '@/eval/manim-author/author';
import { makeBriefs } from '@/eval/manim-author/make-briefs';
import { mathClipModules } from '@/lib/subjects/math/clips';

const briefs = JSON.parse(
  readFileSync(join(process.cwd(), 'eval/manim-author/briefs.json'), 'utf8'),
) as Brief[];
const mod = (id: string) => mathClipModules.find((m) => m.entry.id === id)!;
const fence = (code: string) => `Here it is.\n\`\`\`python\n${code}\n\`\`\``;

describe('manim author loop (card 3A-08)', () => {
  it('briefs.json is the 20 briefs of the catalog (every clip but the worked example), in sync with make-briefs', () => {
    expect(briefs).toHaveLength(20);
    expect(briefs).toEqual(makeBriefs());
    expect(briefs.some((b) => b.clipId === 'amgm-semicircle')).toBe(false);
    for (const b of briefs)
      expect(
        mod(b.clipId).entry.presets.some((p) => p.id === b.presetId),
        b.id,
      ).toBe(true);
  });

  it('the prompt carries the chapters, the preset and the numbers to display, and the system prompt the rules and the example', () => {
    const p = buildAuthorPrompt(briefs[0], mod(briefs[0].clipId));
    expect(p).toContain('CHAPTERS = [');
    expect(p).toContain('self.display must have exactly these keys');
    expect(p).toContain(briefs[0].text);
    const sys = buildAuthorSystem('class X: pass');
    expect(sys).toContain('self.sequence');
    expect(sys).toContain('always_redraw');
    expect(sys).toContain('class X: pass');
  });

  it('extracts the python block, or nothing', () => {
    expect(extractPython(fence('x = 1'))).toBe('x = 1\n');
    expect(extractPython('no code here')).toBeNull();
  });

  it('repairs: a failing first file is fixed in round 2, and the repair prompt shows the problems', async () => {
    const seen: string[] = [];
    const answers = [fence('bad'), fence('good')];
    const result = await authorOne(briefs[0], mod(briefs[0].clipId), {
      example: 'ex',
      llm: async (req) => {
        seen.push(req.prompt);
        return { text: answers.shift()!, usage: { inputTokens: 10, outputTokens: 5 } };
      },
      check: async (code) =>
        code.startsWith('good')
          ? { ok: true, problems: [] }
          : { ok: false, problems: ['allowlist: 3: import of os'] },
    });
    expect(result.solvedAt).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    expect(seen[1]).toContain('allowlist: 3: import of os');
    expect(seen[1]).toContain('Your previous attempt');
  });

  it('gives up after 3 rounds, and an answer without a code block counts as a failed round', async () => {
    const result = await authorOne(briefs[0], mod(briefs[0].clipId), {
      example: 'ex',
      llm: async () => ({ text: 'sorry' }),
      check: async () => ({ ok: true, problems: [] }),
    });
    expect(result.solvedAt).toBeNull();
    expect(result.rounds).toHaveLength(3);
    expect(result.rounds[0].problems[0]).toContain('no ```python block');
  });

  it('RSR@1 / RSR@3, and only a complete run at 90% passes', () => {
    const r = (brief: string, solvedAt: number | null): BriefResult => ({
      brief,
      clipId: brief,
      solvedAt,
      rounds: [],
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const eighteenOfTwenty = [
      ...Array.from({ length: 12 }, (_, i) => r(`a${i}`, 1)),
      ...Array.from({ length: 6 }, (_, i) => r(`b${i}`, 3)),
      r('x', null),
      r('y', null),
    ];
    const rep = summarise(eighteenOfTwenty, 20);
    expect(rep.rsr1).toBeCloseTo(0.6);
    expect(rep.rsr3).toBeCloseTo(0.9);
    expect(rep.pass).toBe(true);
    expect(rep.tokensPerSolved).toBe(Math.round((20 * 150) / 18));
    expect(summarise(eighteenOfTwenty.slice(0, 10), 20).pass).toBe(false); // partial
    expect(
      summarise([...eighteenOfTwenty.slice(0, 17), r('z', null), r('w', null), r('v', null)], 20)
        .pass,
    ).toBe(false);
  });
});
