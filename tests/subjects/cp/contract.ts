/**
 * Shared contract tests for Phase 2 module entries (tasks/phase-2.md §2, "card mẫu").
 * One call per entry registers the checks every entry must pass; the entry's own test file adds
 * the oracle and the beat-order checks that depend on its algorithm.
 */
import { describe, expect, it } from 'vitest';
import { fill, hasRequiredLocales, msg, unresolved } from '@/lib/tutor/catalog/messages';
import type { Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';

const LOCALES = ['vi-VN', 'en-US'] as const;
/** Total frames of all presets of one entry (card mẫu, item 3). */
export const MAX_TOTAL_FRAMES = 300;

export type AnyFrame = Frame<unknown>;

export interface Contract<I> {
  entry: WalkthroughEntry<I, never>;
  visualizer: string;
  topics: string[];
  maxFrames: number;
  /** preset ids, in order */
  presets: string[];
  /** beatDef ids, in order */
  beats: string[];
  /** beatDef ids marked `required` */
  required: string[];
  pseudoLines: number;
  /** var names a frame or a narration may use */
  vars: string[];
  /** pointer names a frame may use */
  pointers: string[];
  /** more inputs for the shape checks (the presets are always included) */
  extra?: I[];
  /** inputs that `validateInput` must reject */
  bad: unknown[];
  /** beat id → what the correct choice is for this input at frame i (independent of `answer`) */
  predict?: Record<
    string,
    { options: number; expected(input: I, frames: readonly AnyFrame[], i: number): number }
  >;
  /** the entry has a `problem` with this many subtasks */
  subtasks?: number;
  /** extra integers allowed in explanations (constants of the algorithm, such as 10^9) */
  allow?: number[];
  /** `pitfalls` must carry a `cpp` and a `py` note on top of the generic one */
  langPitfalls?: boolean;
}

export const beatOf = (f: AnyFrame): string[] =>
  (f.meta.tags ?? []).filter((t) => t.startsWith('beat:')).map((t) => t.slice(5));

function numbersIn(x: unknown, out: Set<number>): void {
  if (typeof x === 'number') out.add(x);
  else if (typeof x === 'string')
    for (const d of x.match(/-?\d+/g) ?? []) out.add(Number(d)); // string vars such as '1, 3, 0'
  else if (Array.isArray(x)) x.forEach((v) => numbersIn(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => numbersIn(v, out));
}

export function entryContract<I>(c: Contract<I>): void {
  const { entry } = c;
  const gen = (input: I, locale = 'vi-VN'): readonly AnyFrame[] =>
    steps(entry as unknown as WalkthroughEntry<I, unknown>, input, { locale });
  const inputs: I[] = [...entry.presets.map((p) => p.input as I), ...(c.extra ?? [])];

  describe(`${entry.id} contract: static fields`, () => {
    it('matches the card', () => {
      expect(entry.subject).toBe('cp');
      expect(entry.entryRev).toBe(1);
      expect(entry.visualizer).toBe(c.visualizer);
      expect(entry.curriculumTopics).toEqual(c.topics);
      expect(entry.customInput).toBe(false);
      expect(entry.maxFrames).toBe(c.maxFrames);
      expect(entry.code.pseudo).toHaveLength(c.pseudoLines);
      expect(entry.presets.map((p) => p.id)).toEqual(c.presets);
      expect(entry.beatDefs.map((b) => b.id)).toEqual(c.beats);
      expect(entry.beatDefs.filter((b) => b.required).map((b) => b.id)).toEqual(c.required);
    });

    it('real code has no comments: impl lines are not localized', () => {
      for (const line of entry.code.impl.cpp) expect(line).not.toContain('//');
      for (const line of entry.code.impl.py) expect(line).not.toContain('#');
    });
  });

  describe(`${entry.id} contract: input`, () => {
    it('every preset passes validateInput', () => {
      for (const p of entry.presets) {
        expect(validateInput(entry as never, p.input), p.id).toEqual({ ok: true, value: p.input });
      }
    });

    it('rejects bad inputs', () => {
      for (const raw of c.bad) {
        expect(validateInput(entry as never, raw).ok, JSON.stringify(raw)).toBe(false);
      }
    });

    it('is deterministic and does not mutate its input', () => {
      for (const input of inputs) {
        const copy = structuredClone(input);
        const before = JSON.stringify(copy);
        const a = gen(copy);
        expect(JSON.stringify(copy)).toBe(before);
        expect(gen(copy)).toEqual(a);
      }
    });
  });

  describe(`${entry.id} contract: frames`, () => {
    it('presets stay within maxFrames and the total of 300', () => {
      let total = 0;
      for (const p of entry.presets) {
        const n = gen(p.input as I).length;
        expect(n, p.id).toBeLessThanOrEqual(entry.maxFrames);
        total += n;
      }
      expect(total).toBeLessThanOrEqual(MAX_TOTAL_FRAMES);
    });

    it('index, codeLine, tags, vars and pointers are well-formed', () => {
      for (const input of inputs) {
        const frames = gen(input);
        frames.forEach((f, i) => {
          expect(f.meta.index).toBe(i);
          expect(f.meta.codeLine).toBeGreaterThanOrEqual(1);
          expect(f.meta.codeLine).toBeLessThanOrEqual(c.pseudoLines);
          expect(f.meta.tags?.length ?? 0).toBeLessThanOrEqual(1);
          for (const k of Object.keys(f.meta.vars ?? {})) expect(c.vars, `var ${k}`).toContain(k);
          for (const k of Object.keys(f.meta.pointers ?? {}))
            expect(c.pointers, `pointer ${k}`).toContain(k);
        });
        expect(beatOf(frames[0])).toEqual(['start']);
        expect(beatOf(frames[frames.length - 1])).toEqual(['done']);
      }
    });
  });

  describe(`${entry.id} contract: code maps`, () => {
    it.each([
      ['cpp', entry.code.map.cpp, entry.code.impl.cpp],
      ['py', entry.code.map.py, entry.code.impl.py],
    ] as const)('map.%s is total and in range', (_lang, map, impl) => {
      for (let line = 1; line <= c.pseudoLines; line++) {
        const targets = map[line];
        expect(targets, `pseudo line ${line}`).toBeDefined();
        expect(targets.length).toBeGreaterThan(0);
        for (const t of targets) {
          expect(Number.isInteger(t)).toBe(true);
          expect(t).toBeGreaterThanOrEqual(1);
          expect(t).toBeLessThanOrEqual(impl.length);
        }
      }
      expect(
        Object.keys(map)
          .map(Number)
          .sort((a, b) => a - b),
      ).toEqual(Array.from({ length: c.pseudoLines }, (_, i) => i + 1));
    });
  });

  describe(`${entry.id} contract: beats`, () => {
    it('every preset contains every required beat', () => {
      for (const p of entry.presets) {
        const seen = gen(p.input as I).flatMap(beatOf);
        for (const id of c.required) expect(seen, `${p.id}:${id}`).toContain(id);
      }
    });

    it('every emitted beat is a beatDef; every beatDef is used by a preset', () => {
      const ids = entry.beatDefs.map((b) => b.id);
      const used = new Set<string>();
      for (const p of entry.presets) {
        for (const b of gen(p.input as I).flatMap(beatOf)) {
          expect(ids).toContain(b);
          used.add(b);
        }
      }
      for (const id of ids) expect(used.has(id), `unused beat ${id}`).toBe(true);
    });

    it('5..10 beats, hints[3] and a misconception on each', () => {
      expect(entry.beatDefs.length).toBeGreaterThanOrEqual(5);
      expect(entry.beatDefs.length).toBeLessThanOrEqual(10);
      for (const b of entry.beatDefs) {
        expect(b.hints, b.id).toHaveLength(3);
        expect(b.misconceptions?.length ?? 0, b.id).toBeGreaterThanOrEqual(1);
      }
    });

    it('predict beats: choice, answer in range and equal to the independent answer', () => {
      const asked = entry.beatDefs.filter((b) => b.ask?.predict).map((b) => b.id);
      expect(asked.sort()).toEqual(Object.keys(c.predict ?? {}).sort());
      for (const [id, spec] of Object.entries(c.predict ?? {})) {
        const def = entry.beatDefs.find((b) => b.id === id)!;
        const predict = def.ask!.predict!;
        expect(predict.kind).toBe('choice');
        expect(predict.options).toHaveLength(spec.options);
        let seen = 0;
        for (const input of inputs) {
          const frames = gen(input, 'en-US');
          frames.forEach((f, i) => {
            if (!beatOf(f).includes(id)) return;
            seen++;
            const answer = predict.answer(f, frames[i + 1]);
            expect(answer, `${id}#${i}`).toBeGreaterThanOrEqual(0);
            expect(answer, `${id}#${i}`).toBeLessThan(spec.options);
            expect(answer, `${id}#${i} ${JSON.stringify(input)}`).toBe(
              spec.expected(input, frames, i),
            );
          });
        }
        expect(seen, `beat ${id} never asked`).toBeGreaterThan(0);
      }
    });

    it('pitfalls reference real beats; generic and per-language notes exist', () => {
      const p = entry.pitfalls ?? [];
      expect(p.length).toBeGreaterThan(0);
      expect(p.some((x) => x.lang === undefined)).toBe(true);
      if (c.langPitfalls !== false) {
        expect(p.some((x) => x.lang === 'cpp')).toBe(true);
        expect(p.some((x) => x.lang === 'py')).toBe(true);
      }
      for (const x of p) if (x.beat) expect(c.beats).toContain(x.beat);
    });

    it('problem has a statement, constraints and subtasks with complexity', () => {
      if (c.subtasks === undefined) {
        expect(entry.problem).toBeUndefined();
        return;
      }
      const pr = entry.problem!;
      expect(hasRequiredLocales(pr.statement)).toBe(true);
      expect(pr.constraints.length).toBeGreaterThan(0);
      expect(pr.subtasks).toHaveLength(c.subtasks);
      for (const s of pr.subtasks) {
        expect(hasRequiredLocales(s.limit)).toBe(true);
        expect(hasRequiredLocales(s.idea)).toBe(true);
        expect(s.complexity).toMatch(/^O\(/);
      }
    });
  });

  describe(`${entry.id} contract: texts`, () => {
    const all = (): [string, Messages][] => {
      const out: [string, Messages][] = [['title', entry.title]];
      for (const p of entry.presets) out.push([`preset:${p.id}`, p.label]);
      for (const b of entry.beatDefs) {
        out.push([`${b.id}.label`, b.label], [`${b.id}.narration`, b.narration]);
        if (b.ask) out.push([`${b.id}.ask`, b.ask.text]);
        b.ask?.predict?.options.forEach((o, i) => out.push([`${b.id}.option${i}`, o]));
        b.hints?.forEach((h, i) => out.push([`${b.id}.hint${i}`, h]));
        b.misconceptions?.forEach((x, i) => out.push([`${b.id}.misc${i}`, x]));
      }
      (entry.pitfalls ?? []).forEach((x, i) => out.push([`pitfall${i}`, x.text]));
      if (entry.problem) {
        out.push(['problem.statement', entry.problem.statement]);
        entry.problem.constraints.forEach((x, i) => out.push([`problem.constraint${i}`, x]));
      }
      return out;
    };

    it('every Messages has non-empty vi-VN and en-US', () => {
      for (const [name, text] of all()) expect(hasRequiredLocales(text), name).toBe(true);
    });

    it('narration only uses known vars and is fully filled at every beat of every preset', () => {
      for (const b of entry.beatDefs)
        for (const l of LOCALES)
          for (const tok of unresolved(msg(b.narration, l)))
            expect(c.vars, `${b.id}/${l}`).toContain(tok.slice(1, -1));
      for (const p of entry.presets) {
        for (const l of LOCALES) {
          for (const f of gen(p.input as I, l)) {
            for (const id of beatOf(f)) {
              const def = entry.beatDefs.find((b) => b.id === id)!;
              const text = fill(msg(def.narration, l), f.meta.vars);
              expect(unresolved(text), `${p.id}/${l}/${id}`).toEqual([]);
              expect(text.length).toBeGreaterThan(0);
            }
          }
        }
      }
    });

    it('explanation: non-empty, <= 160 chars, placeholder-free, mostly differs per locale', () => {
      for (const input of inputs) {
        const vi = gen(input, 'vi-VN');
        const en = gen(input, 'en-US');
        expect(vi.length).toBe(en.length);
        vi.forEach((f, i) => {
          for (const e of [f.meta.explanation, en[i].meta.explanation]) {
            expect(e.length, e).toBeGreaterThan(0);
            expect(e.length, e).toBeLessThanOrEqual(160);
            expect(unresolved(e)).toEqual([]);
          }
        });
        // formula-only frames (`P[1] = P[0] + a[0]`) may read the same in both languages
        const same = vi.filter((f, i) => f.meta.explanation === en[i].meta.explanation).length;
        expect(same, 'frames identical in both locales').toBeLessThanOrEqual(vi.length / 2);
        expect(vi[0].meta.explanation).not.toBe(en[0].meta.explanation);
        expect(vi[vi.length - 1].meta.explanation).not.toBe(en[en.length - 1].meta.explanation);
      }
    });

    it('unknown locale falls back to en-US', () => {
      const input = entry.presets[0].input as I;
      expect(gen(input, 'fr-FR').map((f) => f.meta.explanation)).toEqual(
        gen(input, 'en-US').map((f) => f.meta.explanation),
      );
    });

    it('every integer in an explanation comes from the input, the state, a pointer or the vars', () => {
      for (const input of inputs) {
        for (const l of LOCALES) {
          for (const f of gen(input, l)) {
            const allowed = new Set<number>([-1, 0, 1, ...(c.allow ?? [])]);
            numbersIn(input, allowed);
            numbersIn(f.state, allowed);
            numbersIn(f.meta.vars, allowed);
            numbersIn(f.meta.pointers, allowed);
            numbersIn(f.meta.aux, allowed);
            const nums = f.meta.explanation.replace(/−/g, '-').match(/-?\d+/g) ?? [];
            for (const n of nums)
              expect(allowed.has(Number(n)), `${l} "${f.meta.explanation}" has ${n}`).toBe(true);
          }
        }
      }
    });
  });
}
