import { describe, expect, it } from 'vitest';
import { CLEAN_OPS, cleanVariants, fingerprint } from '@/eval/tutor-review/clean-variants';
import { MIN_CLEAN } from '@/eval/tutor-review/score';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { steps } from '@/lib/tutor/engine/generate';
import { buildReviewMaterial } from '@/lib/tutor/review-schema';

// The clean side of the calibration: distinct, known-good variants. No model, no network.

const entries = SUBJECT_PACKS.flatMap((p) => p.walkthroughs);
const variants = cleanVariants(entries);

describe('cleanVariants (C5)', () => {
  it(`has at least ${MIN_CLEAN} distinct variants, the real entries first`, () => {
    expect(new Set(variants.map((v) => fingerprint(v.entry))).size).toBe(variants.length);
    expect(variants.length).toBeGreaterThanOrEqual(MIN_CLEAN);
    expect(variants.slice(0, entries.length).map((v) => v.entry)).toEqual(entries);
    expect(new Set(variants.map((v) => v.id)).size).toBe(variants.length);
  });

  it('has at least 10 distinct variants of each single entry', () => {
    for (const e of entries) expect(cleanVariants([e]).length).toBeGreaterThanOrEqual(MIN_CLEAN);
  });

  it('drops a rewrite that changes nothing (no plain repeats)', () => {
    const [e] = entries;
    const twice = cleanVariants([e, e]);
    expect(twice.map((v) => v.id)).toEqual(cleanVariants([e]).map((v) => v.id));
  });

  it('never touches run() or the original entry', () => {
    const before = entries.map(fingerprint);
    for (const v of variants) {
      const orig = entries.find((e) => e.id === v.entry.id)!;
      expect(v.entry.run).toBe(orig.run);
      expect(v.entry.id).toBe(orig.id);
      expect(v.entry.entryRev).toBe(orig.entryRev);
    }
    expect(entries.map(fingerprint)).toEqual(before);
  });

  it('keeps the frames of every preset, in both locales (data rewrites only)', () => {
    for (const v of variants) {
      const orig = entries.find((e) => e.id === v.entry.id)!;
      for (const locale of ['vi-VN', 'en-US']) {
        for (const p of orig.presets) {
          const q = v.entry.presets.find((x) => x.id === p.id)!;
          expect(steps(v.entry, q.input, { locale }), `${v.id} ${p.id}`).toEqual(
            steps(orig, p.input, { locale }),
          );
        }
      }
    }
  }, 60_000);

  it('changes what the reviewer sees in every rewrite, and nothing else', () => {
    for (const v of variants.filter((x) => x.ops.length > 0)) {
      const orig = entries.find((e) => e.id === v.entry.id)!;
      const [a, b] = [buildReviewMaterial(orig), buildReviewMaterial(v.entry)];
      expect(JSON.stringify(b), v.id).not.toBe(JSON.stringify(a));
      expect(b.code).toEqual(a.code);
      const states = (m: typeof a) =>
        Object.fromEntries(m.frames.map((f) => [`${f.preset}#${f.index}`, f.state]));
      expect(states(b)).toEqual(states(a)); // reordered presets: same frames, other order
    }
  }, 60_000);

  it('keeps every pseudo placeholder: a rewrite never touches {vars}', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).join(',');
    for (const v of variants) {
      const orig = entries.find((e) => e.id === v.entry.id)!;
      const text = (e: typeof orig) =>
        e.beatDefs.map((b) => ph(Object.values(b.narration).join(' '))).join('|');
      expect(text(v.entry), v.id).toBe(text(orig));
    }
  });

  it('every op alone changes at least one real entry', () => {
    for (const [name, op] of Object.entries(CLEAN_OPS)) {
      expect(
        entries.some((e) => fingerprint(op(e)) !== fingerprint(e)),
        name,
      ).toBe(true);
    }
  });
});
