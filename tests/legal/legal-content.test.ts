import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { privacyEn } from '@/lib/legal/content/privacy.en';
import { privacyVi } from '@/lib/legal/content/privacy.vi';
import { termsEn } from '@/lib/legal/content/terms.en';
import { termsVi } from '@/lib/legal/content/terms.vi';
import type { LegalContext, LegalDocument } from '@/lib/legal/types';
import { TERMS_VERSION } from '@/lib/legal/versions';

const context: LegalContext = {
  product: 'KHAITAM',
  domain: 'khaitam.ai.vn',
  email: 'hello@example.test',
  version: TERMS_VERSION,
};

const pairs = [
  { name: 'terms', vi: termsVi(context), en: termsEn(context) },
  { name: 'privacy', vi: privacyVi(context), en: privacyEn(context) },
];
const documents: [string, LegalDocument][] = pairs.flatMap(({ name, vi, en }) => [
  [`${name} (vi)`, vi],
  [`${name} (en)`, en],
]);

function textOf(doc: LegalDocument): string {
  return doc.sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => {
      if (block.type === 'p') return [block.text];
      if (block.type === 'table') return [...block.head, ...block.rows.flat()];
      return [...block.items];
    })
    .join('\n');
}

describe.each(documents)('%s', (_name, doc) => {
  it('has unique section ids and no empty heading', () => {
    const ids = doc.sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of doc.sections) {
      expect(section.heading.trim()).not.toBe('');
      expect(section.blocks.length).toBeGreaterThan(0);
    }
  });

  it('has tables whose rows fit their head and whose first cells are unique (React keys)', () => {
    for (const block of doc.sections.flatMap((section) => section.blocks)) {
      if (block.type !== 'table') continue;
      for (const row of block.rows) expect(row).toHaveLength(block.head.length);
      const firsts = block.rows.map((row) => row[0]);
      expect(new Set(firsts).size).toBe(firsts.length);
    }
  });

  it('names the contact email and no unfilled placeholder', () => {
    const text = textOf(doc);
    expect(text).toContain(context.email);
    expect(text).not.toMatch(/undefined|\[object|\{\{|TODO/);
  });
});

describe.each(pairs)('$name: Vietnamese and English say the same', ({ vi, en }) => {
  it('has the same sections in the same order', () => {
    expect(en.sections.map((section) => section.id)).toEqual(
      vi.sections.map((section) => section.id),
    );
  });

  it('has the same block kinds and sizes in every section', () => {
    const shape = (doc: LegalDocument) =>
      doc.sections.map((section) =>
        section.blocks.map((block) =>
          block.type === 'table'
            ? `table:${block.rows.length}x${block.head.length}`
            : block.type === 'p'
              ? 'p'
              : `${block.type}:${block.items.length}`,
        ),
      );
    expect(shape(en)).toEqual(shape(vi));
  });
});

describe('what the texts promise matches what the code does', () => {
  const terms = textOf(pairs[0].vi);
  const privacy = textOf(pairs[1].vi);

  it('records the accepted version in the terms', () => {
    expect(terms).toContain(TERMS_VERSION);
    expect(privacy).toContain(TERMS_VERSION);
  });

  it('says the trial lasts 30 days, as MEMBERSHIP_TRIAL_DAYS defaults to', () => {
    expect(terms).toMatch(/30 ngày/);
  });

  it('names the two cookies the app sets and the 30-day session', () => {
    expect(privacy).toContain('openmaic_session');
    expect(privacy).toContain('anonymous_id');
  });

  it('names the current AI providers', () => {
    expect(privacy).toContain('DeepSeek');
    expect(privacy).toContain('Anthropic');
  });
});

describe('the pages that show the texts', () => {
  // The texts are functions. A server page cannot hand a function to the client component that
  // draws them, which made both pages fail at request time; they must pass a name instead.
  it.each([
    ['terms', 'app/terms/page.tsx'],
    ['privacy', 'app/privacy/page.tsx'],
  ])('%s passes a name, not the text functions', (kind, file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).toContain(`<LegalPage kind="${kind}" />`);
    expect(source).not.toContain('lib/legal/content');
  });
});
