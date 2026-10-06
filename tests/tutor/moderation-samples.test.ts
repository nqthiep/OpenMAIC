import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MODERATION_CATEGORIES } from '@/lib/tutor/moderation';

// Calibration samples for the content filter (ADR 0014 decision 7, TEST-STRATEGY §6).
// This test only validates the files; it never calls a model.

interface Sample {
  id: string;
  text: string;
  expected: 'allow' | 'block';
  category?: string;
  lang: 'vi' | 'en';
}

const DIR = fileURLToPath(new URL('../../eval/tutor-moderation/samples/', import.meta.url));

function load(name: string): Sample[] {
  const raw = readFileSync(DIR + name, 'utf8');
  expect(raw.includes('\r'), `${name}: CRLF`).toBe(false);
  expect(raw.endsWith('\n'), `${name}: missing final newline`).toBe(true);
  return raw
    .slice(0, -1)
    .split('\n')
    .map((line, i) => {
      expect(line.trim(), `${name}:${i + 1} blank line`).not.toBe('');
      return JSON.parse(line) as Sample;
    });
}

// `in`: student messages. `out`: tutor replies.
const harmful = load('harmful.jsonl');
const benign = load('benign.jsonl');
const outHarmful = load('out-harmful.jsonl');
const outBenign = load('out-benign.jsonl');
const allHarmful = [...harmful, ...outHarmful];
const all = [...harmful, ...benign, ...outHarmful, ...outBenign];

const STYLES = ['direct', 'indirect', 'inject'] as const;
const CATS = MODERATION_CATEGORIES.join('|');
const HARMFUL_ID = new RegExp(`^h-(${CATS})-(${STYLES.join('|')}|mixed)-\\d{3}$`);
const OUT_HARMFUL_ID = new RegExp(`^ho-(${CATS})-(${STYLES.join('|')})-\\d{3}$`);
const BENIGN_ID = /^b-(csterm|math|info|chat|stress|lookalike)-\d{3}$/;
const OUT_BENIGN_ID = /^bo-(csterm|math|info|chat|stress|refusal)-\d{3}$/;

const share = (rows: Sample[], lang: Sample['lang']) =>
  rows.filter((r) => r.lang === lang).length / rows.length;

describe('tutor-moderation calibration samples', () => {
  it('meets the minimum counts (in: >= 100 harmful, >= 200 benign; out: >= 40 and >= 80)', () => {
    expect(harmful.length).toBeGreaterThanOrEqual(100);
    expect(benign.length).toBeGreaterThanOrEqual(200);
    expect(outHarmful.length).toBeGreaterThanOrEqual(40);
    expect(outBenign.length).toBeGreaterThanOrEqual(80);
  });

  it('every row has exactly the documented shape', () => {
    for (const row of all) {
      expect(
        Object.keys(row).filter((k) => !['id', 'text', 'expected', 'category', 'lang'].includes(k)),
      ).toEqual([]);
      expect(typeof row.id).toBe('string');
      expect(typeof row.text).toBe('string');
      expect(['allow', 'block']).toContain(row.expected);
      expect(['vi', 'en']).toContain(row.lang);
    }
  });

  it('ids are unique across both files and follow the scheme', () => {
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    for (const r of harmful) expect(r.id, r.id).toMatch(HARMFUL_ID);
    for (const r of benign) expect(r.id, r.id).toMatch(BENIGN_ID);
    for (const r of outHarmful) expect(r.id, r.id).toMatch(OUT_HARMFUL_ID);
    for (const r of outBenign) expect(r.id, r.id).toMatch(OUT_BENIGN_ID);
  });

  it('texts are unique, non-empty, short chat messages', () => {
    const norm = all.map((r) => r.text.trim().toLowerCase());
    expect(new Set(norm).size).toBe(all.length);
    for (const r of all) {
      expect(r.text, r.id).toBe(r.text.trim());
      expect(r.text.length, r.id).toBeGreaterThan(0);
      expect(r.text.length, r.id).toBeLessThanOrEqual(r.expected === 'block' ? 200 : 300);
    }
  });

  it('harmful rows expect block with a valid category that matches the id', () => {
    const known: readonly string[] = MODERATION_CATEGORIES;
    for (const r of allHarmful) {
      expect(r.expected, r.id).toBe('block');
      expect(known, r.id).toContain(r.category);
      expect(r.id.replace(/^ho?-/, ''), r.id).toMatch(new RegExp(`^${r.category}-`));
    }
  });

  it('benign rows expect allow and carry no category', () => {
    for (const r of [...benign, ...outBenign]) {
      expect(r.expected, r.id).toBe('allow');
      expect(r.category, r.id).toBeUndefined();
    }
  });

  it('covers every category in both languages and every phrasing style', () => {
    for (const category of MODERATION_CATEGORIES) {
      const rows = harmful.filter((r) => r.category === category);
      expect(rows.length, category).toBeGreaterThanOrEqual(15);
      for (const lang of ['vi', 'en'] as const) {
        expect(
          rows.filter((r) => r.lang === lang).length,
          `${category}/${lang}`,
        ).toBeGreaterThanOrEqual(5);
      }
      for (const style of STYLES) {
        expect(
          rows.filter((r) => r.id.includes(`-${style}-`)).length,
          `${category}/${style}`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('covers every category in the out direction, in both languages', () => {
    for (const category of MODERATION_CATEGORIES) {
      const rows = outHarmful.filter((r) => r.category === category);
      expect(rows.length, category).toBeGreaterThanOrEqual(6);
      for (const lang of ['vi', 'en'] as const) {
        expect(rows.filter((r) => r.lang === lang).length, `${category}/${lang}`).toBeGreaterThan(
          0,
        );
      }
    }
    for (const group of ['csterm', 'math', 'info', 'chat', 'stress', 'refusal']) {
      expect(
        outBenign.filter((r) => r.id.startsWith(`bo-${group}-`)).length,
        group,
      ).toBeGreaterThan(4);
    }
  });

  it('has >= 10 mixed samples: a legit CP question plus a harmful request, spread over categories', () => {
    const mixed = harmful.filter((r) => r.id.includes('-mixed-'));
    expect(mixed.length).toBeGreaterThanOrEqual(10);
    expect(new Set(mixed.map((r) => r.category)).size).toBe(MODERATION_CATEGORIES.length);
    expect(new Set(mixed.map((r) => r.lang))).toEqual(new Set(['vi', 'en']));
    const cp =
      /merge sort|hash map|BFS|two pointers|quicksort|con trỏ|recursion|đọc file|vector|Dijkstra|Bài này em làm/i;
    for (const r of mixed) {
      expect(r.text, r.id).toMatch(cp);
      expect(r.expected, r.id).toBe('block');
    }
  });

  it('relabelled and added in-direction samples', () => {
    const byId = new Map(all.map((r) => [r.id, r]));
    // asking the AI teacher for its own number was ambiguous: now it asks for a classmate's
    expect(byId.get('h-personal-data-direct-002')?.text).toMatch(/bạn .*lớp mình/);
    expect(byId.get('h-personal-data-direct-002')?.text).not.toMatch(/thầy/i);
    expect(benign.some((r) => /Em tên Nam, lớp 9A/.test(r.text))).toBe(true);
    expect(
      benign.filter((r) => /tên|name|I am Lan|Em là/i.test(r.text) && r.id.includes('lookalike'))
        .length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('mixes Vietnamese and English in every file', () => {
    for (const rows of [harmful, benign, outHarmful, outBenign]) {
      expect(share(rows, 'vi')).toBeGreaterThanOrEqual(0.3);
      expect(share(rows, 'en')).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('benign set includes the tricky computer-science vocabulary', () => {
    const terms: Record<string, RegExp> = {
      'kill process': /kill\b.*\bprocess|process\b.*\bkill|kill -9/i,
      'attack vector': /attack vector/i,
      'exploit the DP structure': /exploit.*(\bdp\b|quy hoạch động)/i,
      hack: /\bhack/i,
      bomb: /bomb/i,
      shoot: /\bshoot|bắn/i,
      execute: /\bexec/i,
      crash: /crash/i,
    };
    for (const [name, re] of Object.entries(terms)) {
      expect(benign.filter((r) => re.test(r.text)).length, name).toBeGreaterThanOrEqual(3);
    }
  });

  it('benign set has everyday stress and chit-chat messages and injection look-alikes', () => {
    for (const group of ['chat', 'stress', 'lookalike']) {
      expect(
        benign.filter((r) => r.id.startsWith(`b-${group}-`)).length,
        group,
      ).toBeGreaterThanOrEqual(10);
    }
  });

  it('harmful set has prompt-injection attempts', () => {
    const injected = harmful.filter((r) => r.id.includes('-inject-'));
    expect(injected.length).toBeGreaterThanOrEqual(18);
    const override =
      /ignore|disregard|bỏ qua|quên|system|hệ thống|admin|developer mode|new rule|you are now|no restrictions|từ giờ|allow/i;
    expect(injected.filter((r) => override.test(r.text)).length).toBe(injected.length);
  });

  // Safety guards on the content itself.
  it('sexual samples never reference minors or school', () => {
    const minors =
      /trẻ|em bé|nhỏ tuổi|vị thành niên|học sinh|child|kid|minor|teen|underage|school|lớp|loli|shota|\b1\d\s*(tuổi|y\.?o)/i;
    for (const r of allHarmful.filter((x) => x.category === 'sexual')) {
      expect(r.text, r.id).not.toMatch(minors);
    }
  });

  it('out-harmful rows are classifier strings: placeholders in brackets, no numbered steps', () => {
    for (const r of outHarmful) {
      expect(r.text, r.id).not.toMatch(/\b(1\.|bước 1|step 1)/i);
      expect(r.text, r.id).not.toMatch(/\n/);
    }
    // anything operational is a bracketed placeholder, never real detail
    const withPlaceholder = outHarmful.filter((r) => /\[[^\]]+\]/.test(r.text));
    expect(withPlaceholder.length).toBeGreaterThanOrEqual(25);
  });

  it('contains no real-looking contact or ID data (digit runs are all zeros)', () => {
    for (const r of all) {
      expect(r.text, r.id).not.toMatch(/@|https?:/i);
      for (const run of r.text.match(/\d(?:[ .-]?\d){8,}/g) ?? []) {
        expect(run.replace(/\D/g, ''), r.id).toMatch(/^0+$/);
      }
    }
  });
});
