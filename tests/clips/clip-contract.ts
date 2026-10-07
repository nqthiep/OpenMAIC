/**
 * Shared contract tests for clip template modules (tasks/phase-3.md §3.1, "card mẫu T"). One call per clip registers
 * the checks every `T` task must pass; the clip's own test file adds its independent recomputation and anything
 * specific to its mathematics.
 */
import { validateScene } from '@openmaic/dsl';
import { describe, expect, it } from 'vitest';
import { clipAssetKey } from '@/lib/clips/assets';
import { createClipProvider } from '@/lib/clips/provider';
import type { ClipAsset, ClipModule } from '@/lib/clips/types';
import { validateClipInput } from '@/lib/clips/validate';
import { hasRequiredLocales } from '@/lib/tutor/catalog/messages';
import type { Messages } from '@/lib/tutor/catalog/types';

export interface ClipContract<I> {
  module: ClipModule<I>;
  /** preset ids, in order (3–5) */
  presets: string[];
  /** chapter ids in order with the allowed duration range in seconds, from the card */
  chapters: { id: string; range: [number, number] }[];
  /** inputs that `validateClipInput` must reject */
  bad: unknown[];
  /** inputs at the boundary of `inputSpec` where `invariants` must still hold */
  edges: I[];
  /** the same numbers as `expectedDisplay`, recomputed independently of the module */
  display: (input: I) => Record<string, number>;
  /** a sweep of more inputs for `invariants` and `expectedDisplay` (the presets and edges are always included) */
  sweep?: I[];
}

const LOCALES = ['vi-VN', 'en-US'] as const;
/** sentences of a teacher line: at most 2 (card §3.1) */
const sentences = (s: string): number => (s.match(/[.!?…](\s|$)/g) ?? []).length || 1;

export function clipContract<I>(c: ClipContract<I>): void {
  const { entry, expectedDisplay } = c.module;
  const presetInputs = entry.presets.map((p) => p.input);
  const inputs: I[] = [...presetInputs, ...c.edges, ...(c.sweep ?? [])];

  describe(`${entry.id} clip contract: static fields`, () => {
    it('matches the card: template, pinned engine, 720p30, silent, no baked text', () => {
      expect(entry.kind).toBe('template');
      expect(entry.engine).toEqual({ name: 'manim-ce', version: '0.21.0', templateRev: 1 });
      expect(entry.render).toEqual({ w: 1280, h: 720, fps: 30 });
      expect(entry.silent).toBe(true);
      expect(entry.bakedText).toBe(false);
      expect(entry.curriculumTopics.length).toBeGreaterThan(0);
    });

    it('has 3 to 5 presets with the card ids', () => {
      expect(entry.presets.length).toBeGreaterThanOrEqual(3);
      expect(entry.presets.length).toBeLessThanOrEqual(5);
      expect(entry.presets.map((p) => p.id)).toEqual(c.presets);
    });
  });

  describe(`${entry.id} clip contract: input`, () => {
    it('every preset passes validateClipInput unchanged', () => {
      for (const p of entry.presets) {
        expect(validateClipInput(entry, p.input), p.id).toEqual({ ok: true, value: p.input });
      }
    });

    it('rejects every bad input', () => {
      for (const raw of c.bad) {
        expect(validateClipInput(entry, raw).ok, JSON.stringify(raw)).toBe(false);
      }
    });

    it('the boundary inputs are valid', () => {
      for (const e of c.edges) expect(validateClipInput(entry, e).ok, JSON.stringify(e)).toBe(true);
    });
  });

  describe(`${entry.id} clip contract: mathematics`, () => {
    it('invariants hold on every preset, boundary and sweep input', () => {
      for (const input of inputs) expect(entry.invariants(input), JSON.stringify(input)).toBe(true);
    });

    it('expectedDisplay equals the independent recomputation, with the same keys', () => {
      for (const input of inputs) {
        const got = expectedDisplay(input);
        const want = c.display(input);
        expect(Object.keys(got).sort(), JSON.stringify(input)).toEqual(Object.keys(want).sort());
        for (const k of Object.keys(want))
          expect(got[k], `${k} of ${JSON.stringify(input)}`).toBeCloseTo(want[k], 9);
        for (const v of Object.values(got)) expect(Number.isFinite(v)).toBe(true);
      }
    });

    it('neither function mutates its input or throws on the boundary', () => {
      for (const input of inputs) {
        const before = JSON.stringify(input);
        entry.invariants(input);
        expectedDisplay(input);
        expect(JSON.stringify(input)).toBe(before);
      }
    });
  });

  describe(`${entry.id} clip contract: chapters`, () => {
    it('has the card chapters, contiguous from 0 s, each within its range, 20 to 90 s in total', () => {
      expect(entry.chapters.map((x) => x.id)).toEqual(c.chapters.map((x) => x.id));
      let t = 0;
      entry.chapters.forEach((ch, i) => {
        expect(ch.startSec, ch.id).toBe(t);
        const len = ch.endSec - ch.startSec;
        expect(len, `${ch.id} length`).toBeGreaterThanOrEqual(c.chapters[i].range[0]);
        expect(len, `${ch.id} length`).toBeLessThanOrEqual(c.chapters[i].range[1]);
        t = ch.endSec;
      });
      expect(t).toBeGreaterThanOrEqual(20);
      expect(t).toBeLessThanOrEqual(90);
    });

    it('every teacher line is non-empty and at most 2 sentences, in both languages', () => {
      for (const ch of entry.chapters) {
        for (const [name, m] of [
          ['before', ch.before],
          ['after', ch.after],
        ] as const) {
          for (const l of LOCALES) {
            expect(m[l].trim().length, `${ch.id}.${name}/${l}`).toBeGreaterThan(0);
            expect(sentences(m[l]), `${ch.id}.${name}/${l}`).toBeLessThanOrEqual(2);
          }
        }
      }
    });

    it('asks a prediction question at least once in every two consecutive chapters', () => {
      const asks = entry.chapters.map((ch) => (ch.ask ? 1 : 0));
      for (let i = 0; i < asks.length; i += 2) {
        expect(asks[i] + (asks[i + 1] ?? 0), `chapters ${i}-${i + 1}`).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe(`${entry.id} clip contract: sheet and texts`, () => {
    it('the sheet has exactly the chapter ids, with formulas, 3 hints and a misconception each', () => {
      expect(entry.sheet.chapters.map((x) => x.id)).toEqual(entry.chapters.map((x) => x.id));
      for (const s of entry.sheet.chapters) {
        expect(s.formulas.length, s.id).toBeGreaterThan(0);
        for (const f of s.formulas) expect(f, s.id).toMatch(/^\\\([\s\S]+\\\)$/);
        expect(s.hints, s.id).toHaveLength(3);
        expect(s.misconceptions.length, s.id).toBeGreaterThanOrEqual(1);
      }
    });

    it('every Messages has non-empty vi-VN and en-US', () => {
      const all: [string, Messages][] = [['title', entry.title]];
      for (const p of entry.presets) all.push([`preset:${p.id}`, p.label]);
      for (const ch of entry.chapters) {
        all.push(
          [`${ch.id}.label`, ch.label],
          [`${ch.id}.before`, ch.before],
          [`${ch.id}.after`, ch.after],
        );
        if (ch.caption) all.push([`${ch.id}.caption`, ch.caption]);
        if (ch.ask) all.push([`${ch.id}.ask`, ch.ask]);
      }
      for (const s of entry.sheet.chapters) {
        all.push([`${s.id}.shows`, s.shows]);
        s.misconceptions.forEach((x, i) => all.push([`${s.id}.misc${i}`, x]));
        s.hints.forEach((x, i) => all.push([`${s.id}.hint${i}`, x]));
      }
      for (const [name, m] of all) expect(hasRequiredLocales(m), name).toBe(true);
    });

    it('the picture text is symbols and numbers: a caption stays short and has no full sentence', () => {
      for (const ch of entry.chapters) {
        for (const l of LOCALES) {
          if (!ch.caption) continue;
          expect(Array.from(ch.caption[l]).length, `${ch.id}/${l}`).toBeLessThanOrEqual(24);
          expect(ch.caption[l]).not.toMatch(/[.!?]/);
        }
      }
    });
  });

  describe(`${entry.id} clip contract: cache key and assets`, () => {
    it('is stable per input, differs between presets, and ignores the locale (no baked text)', () => {
      const keys = entry.presets.map((p) => JSON.stringify(entry.cacheKeyInput(p.input, 'vi-VN')));
      expect(new Set(keys).size).toBe(keys.length);
      for (const p of entry.presets) {
        expect(entry.cacheKeyInput(p.input, 'vi-VN')).toEqual(
          entry.cacheKeyInput(structuredClone(p.input), 'vi-VN'),
        );
        expect(entry.cacheKeyInput(p.input, 'vi-VN')).toEqual(
          entry.cacheKeyInput(p.input, 'en-US'),
        );
        expect(clipAssetKey(entry, p.input, 'vi-VN')).toBe(clipAssetKey(entry, p.input, 'en-US'));
      }
    });

    it('is not prebuilt yet; with an asset the provider builds one valid slide per chapter', () => {
      for (const p of entry.presets) expect(entry.asset(p.input, 'vi-VN')).toBeNull();
      const asset: ClipAsset = {
        chapters: entry.chapters.map((ch) => ({
          id: ch.id,
          url: `/clips/${entry.id}/${ch.id}.mp4`,
          poster: `/clips/${entry.id}/${ch.id}.png`,
        })),
      };
      const rendered = { ...entry, asset: () => asset };
      const provider = createClipProvider({
        findClip: (id) => (id === entry.id ? rendered : undefined),
      });
      for (const l of LOCALES) {
        const built = provider.build({ id: entry.id }, { locale: l });
        const slides = built.content as { type: 'slide' }[];
        expect(slides).toHaveLength(entry.chapters.length);
        slides.forEach((content, i) => {
          const scene = {
            id: `s${i}`,
            stageId: 'st',
            type: 'slide',
            title: 't',
            order: i,
            content,
            actions: built.actions[i],
          };
          expect(validateScene(scene).valid, `${l} chapter ${i}`).toBe(true);
          expect(provider.claimsScene(scene as never)).toBe(true);
          expect(provider.isStale(scene as never)).toBe(false);
          expect(provider.describe(scene as never)).toContain(entry.sheet.chapters[i].formulas[0]);
        });
      }
    });
  });
}
