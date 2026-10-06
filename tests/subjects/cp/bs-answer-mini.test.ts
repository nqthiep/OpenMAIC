import { describe, expect, it } from 'vitest';
import {
  bsAnswerMiniEntry as entry,
  type BsAnswerMiniInput,
  type BsAnswerMiniState,
} from '@/lib/subjects/cp/catalog/bs-answer-mini';
import { fill, hasRequiredLocales, msg, unresolved } from '@/lib/tutor/catalog/messages';
import type { Messages } from '@/lib/tutor/catalog/types';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';

const LOCALES = ['vi-VN', 'en-US'] as const;
type F = Frame<BsAnswerMiniState>;

const frames = (input: BsAnswerMiniInput, locale = 'vi-VN'): readonly F[] =>
  steps(entry, input, { locale });

/** Independent oracle: try every H from 0 to max(h), keep the largest that gives enough wood. */
function oracle({ h, m }: BsAnswerMiniInput): number {
  let best = -1;
  for (let H = 0; H <= Math.max(...h); H++) {
    let total = 0;
    for (const x of h) if (x > H) total += x - H;
    if (total >= m) best = H;
  }
  return best;
}

const total = (h: readonly number[]): number => h.reduce((a, b) => a + b, 0);
const bits = (n: number): number => n.toString(2).length; // floor(log2 n) + 1
const beatTags = (f: F): string[] =>
  (f.meta.tags ?? []).filter((t) => t.startsWith('beat:')).map((t) => t.slice(5));
const beatsOf = (fs: readonly F[]): { id: string; frame: number }[] =>
  fs.flatMap((f, frame) => beatTags(f).map((id) => ({ id, frame })));
const last = (fs: readonly F[]): F => fs[fs.length - 1];
const num = (v: unknown): number => v as number;

/** Deterministic pseudo-random inputs (MINSTD), valid for the input spec. */
function samples(count: number): BsAnswerMiniInput[] {
  let x = 20251005;
  const next = (n: number): number => {
    x = (x * 48271) % 2147483647;
    return x % n;
  };
  const out: BsAnswerMiniInput[] = [];
  for (let i = 0; i < count; i++) {
    const h = Array.from({ length: 1 + next(8) }, () => 1 + next(40));
    out.push({ h, m: 1 + next(Math.min(100, total(h))) });
  }
  return out;
}

/** Every one-tree input plus the pseudo-random family. */
function family(): BsAnswerMiniInput[] {
  const out = samples(400);
  for (let height = 1; height <= 40; height++)
    for (let m = 1; m <= height; m++) out.push({ h: [height], m });
  out.push({ h: [40, 40, 40, 40, 40, 40, 40, 40], m: 100 }, { h: [40, 1], m: 41 });
  return out;
}

function allMessages(): { where: string; m: Messages }[] {
  const out: { where: string; m: Messages }[] = [{ where: 'title', m: entry.title }];
  entry.presets.forEach((p) => out.push({ where: `preset ${p.id}`, m: p.label }));
  for (const b of entry.beatDefs) {
    out.push(
      { where: `${b.id}.label`, m: b.label },
      { where: `${b.id}.narration`, m: b.narration },
    );
    if (b.ask) out.push({ where: `${b.id}.ask`, m: b.ask.text });
    b.ask?.predict?.options.forEach((o, i) => out.push({ where: `${b.id}.option${i}`, m: o }));
    b.hints?.forEach((m, i) => out.push({ where: `${b.id}.hint${i}`, m }));
    b.misconceptions?.forEach((m, i) => out.push({ where: `${b.id}.misconception${i}`, m }));
  }
  const p = entry.problem;
  if (p) {
    out.push({ where: 'problem.statement', m: p.statement });
    p.constraints.forEach((m, i) => out.push({ where: `problem.constraint${i}`, m }));
    p.subtasks.forEach((s) => {
      out.push({ where: `${s.id}.limit`, m: s.limit }, { where: `${s.id}.idea`, m: s.idea });
    });
  }
  entry.pitfalls?.forEach((q, i) => out.push({ where: `pitfall${i}`, m: q.text }));
  return out;
}

describe('bs-answer-mini: static fields', () => {
  it('matches SCHEMA 4.2', () => {
    expect(entry.id).toBe('bs-answer-mini');
    expect(entry.entryRev).toBe(1);
    expect(entry.subject).toBe('cp');
    expect(entry.visualizer).toBe('array');
    expect(entry.curriculumTopics).toEqual(['t2-binary-search']);
    expect(entry.customInput).toBe(false);
  });

  it('problem has the statement, limits and the two subtasks with complexity', () => {
    const p = entry.problem;
    expect(p?.constraints.length).toBeGreaterThan(0);
    expect(p?.subtasks.map((s) => s.complexity)).toEqual(['O(n·maxH)', 'O(n log maxH)']);
    expect(p?.subtasks.map((s) => s.id)).toEqual(['brute', 'binary']);
  });

  it('every Messages has vi-VN and en-US', () => {
    for (const { where, m } of allMessages()) {
      expect(hasRequiredLocales(m), where).toBe(true);
    }
  });

  it('pitfalls reference real beats and valid languages', () => {
    const ids = new Set(entry.beatDefs.map((b) => b.id));
    for (const q of entry.pitfalls ?? []) {
      expect(q.lang === undefined || q.lang === 'cpp' || q.lang === 'py').toBe(true);
      expect(q.beat === undefined || ids.has(q.beat)).toBe(true);
    }
    expect((entry.pitfalls ?? []).some((q) => q.lang === 'cpp')).toBe(true);
    expect((entry.pitfalls ?? []).some((q) => q.lang === 'py')).toBe(true);
  });
});

describe('bs-answer-mini: input', () => {
  it('every preset passes validateInput', () => {
    for (const p of entry.presets) {
      expect(validateInput(entry, p.input), p.id).toEqual({ ok: true, value: p.input });
    }
  });

  it('has >= 4 presets with unique ids, incl. one tree and m == total', () => {
    expect(entry.presets.length).toBeGreaterThanOrEqual(4);
    expect(new Set(entry.presets.map((p) => p.id)).size).toBe(entry.presets.length);
    expect(entry.presets.some((p) => p.input.h.length === 1)).toBe(true);
    expect(entry.presets.some((p) => p.input.m === total(p.input.h))).toBe(true);
  });

  it('m greater than total height is rejected with m-exceeds-total', () => {
    expect(validateInput(entry, { h: [3, 8, 2], m: 14 })).toEqual({
      ok: false,
      issues: ['$: m-exceeds-total'],
    });
    expect(validateInput(entry, { h: [3, 8, 2], m: 13 }).ok).toBe(true);
  });

  it.each([
    ['empty h', { h: [], m: 1 }],
    ['nine trees', { h: [1, 1, 1, 1, 1, 1, 1, 1, 1], m: 1 }],
    ['tree too tall', { h: [41], m: 1 }],
    ['tree height 0', { h: [0, 5], m: 1 }],
    ['m = 0', { h: [5], m: 0 }],
    ['m too large', { h: [40, 40, 40], m: 101 }],
    ['float h', { h: [1.5], m: 1 }],
    ['missing m', { h: [5] }],
    ['unknown key', { h: [5], m: 1, extra: 1 }],
  ])('rejects %s', (_name, raw) => {
    expect(validateInput(entry, raw).ok).toBe(false);
  });
});

describe('bs-answer-mini: result', () => {
  it('every preset ends on the oracle answer', () => {
    for (const p of entry.presets) {
      const fs = frames(p.input);
      const end = last(fs);
      expect(end.meta.vars?.lo, p.id).toBe(oracle(p.input));
      expect(end.meta.vars?.hi, p.id).toBe(oracle(p.input));
      expect(end.state.threshold?.value, p.id).toBe(oracle(p.input));
    }
  });

  it('known answers: classic 15, all-equal 3, one-tree 18, take-all 0, tiny-need 8', () => {
    const want: Record<string, number> = {
      classic: 15,
      'all-equal': 3,
      'one-tree': 18,
      'take-all': 0,
      'tiny-need': 8,
    };
    for (const p of entry.presets) {
      expect(last(frames(p.input)).meta.vars?.lo, p.id).toBe(want[p.id]);
    }
  });

  it('matches the oracle on a wide family of inputs', () => {
    for (const input of family()) {
      expect(last(frames(input)).meta.vars?.lo, JSON.stringify(input)).toBe(oracle(input));
    }
  });

  it('edges: one tree, m == total (H = 0), m = 1 on a flat field, tallest single tree', () => {
    expect(last(frames({ h: [1], m: 1 })).meta.vars?.lo).toBe(0);
    expect(last(frames({ h: [30], m: 30 })).meta.vars?.lo).toBe(0);
    expect(last(frames({ h: [40], m: 1 })).meta.vars?.lo).toBe(39);
    expect(last(frames({ h: [7, 7, 7], m: 1 })).meta.vars?.lo).toBe(6);
    expect(last(frames({ h: [40, 40, 40, 40, 40, 40, 40, 40], m: 100 })).meta.vars?.lo).toBe(27);
  });

  it('does not mutate the input and is deterministic', () => {
    for (const p of entry.presets) {
      const before = structuredClone(p.input);
      const a = frames(p.input);
      const b = frames(p.input);
      expect(p.input).toEqual(before);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});

describe('bs-answer-mini: beats', () => {
  it('every preset has the required beats; required beats are brute and done', () => {
    expect(entry.beatDefs.map((b) => b.id)).toEqual([
      'brute',
      'monotonic',
      'check',
      'narrow',
      'done',
    ]);
    expect(entry.beatDefs.filter((b) => b.required).map((b) => b.id)).toEqual(['brute', 'done']);
    for (const p of entry.presets) {
      const ids = new Set(beatsOf(frames(p.input)).map((b) => b.id));
      for (const b of entry.beatDefs.filter((d) => d.required)) {
        expect(ids.has(b.id), `${p.id}: ${b.id}`).toBe(true);
      }
    }
  });

  it('every beatDef is used in at least one preset, and every tag has a beatDef', () => {
    const defs = new Set(entry.beatDefs.map((b) => b.id));
    const used = new Set<string>();
    for (const p of entry.presets) {
      for (const { id } of beatsOf(frames(p.input))) {
        expect(defs.has(id), id).toBe(true);
        used.add(id);
      }
    }
    for (const id of defs) expect(used.has(id), id).toBe(true);
  });

  it('beat order: brute, monotonic, then (check, narrow)+, then done only at the end', () => {
    for (const input of family()) {
      const ids = beatsOf(frames(input)).map((b) => b.id);
      expect(ids.slice(0, 2), JSON.stringify(input)).toEqual(['brute', 'monotonic']);
      expect(ids[ids.length - 1]).toBe('done');
      expect(ids.filter((x) => x === 'done')).toHaveLength(1);
      const mid = ids.slice(2, -1);
      expect(mid.length).toBeGreaterThanOrEqual(2);
      expect(mid.every((x, i) => x === (i % 2 === 0 ? 'check' : 'narrow'))).toBe(true);
    }
  });

  it('fill(narration, vars) leaves no {..} at any beat, either locale', () => {
    const byId = new Map(entry.beatDefs.map((b) => [b.id, b]));
    for (const p of entry.presets) {
      for (const locale of LOCALES) {
        const fs = frames(p.input, locale);
        for (const { id, frame } of beatsOf(fs)) {
          const def = byId.get(id);
          const text = fill(msg(def!.narration, locale), fs[frame].meta.vars);
          expect(unresolved(text), `${p.id}/${locale}/${id}`).toEqual([]);
          expect(text.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('bs-answer-mini: predictions', () => {
  const asked = entry.beatDefs.filter((b) => b.ask?.predict);

  it('monotonic and narrow ask a choice question with valid options', () => {
    expect(asked.map((b) => b.id)).toEqual(['monotonic', 'narrow']);
    for (const b of asked) {
      const predict = b.ask!.predict!;
      expect(predict.kind).toBe('choice');
      expect(predict.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('answer() is an option index and agrees with an independent computation', () => {
    for (const input of [...entry.presets.map((p) => p.input), ...family()]) {
      const fs = frames(input);
      for (const { id, frame } of beatsOf(fs)) {
        const def = entry.beatDefs.find((b) => b.id === id);
        const predict = def?.ask?.predict;
        if (!predict) continue;
        const got = predict.answer(fs[frame], fs[frame + 1]);
        expect(Number.isInteger(got) && got >= 0 && got < predict.options.length).toBe(true);
        const vars = fs[frame].meta.vars!;
        if (id === 'monotonic') {
          // independent: wood at the two heights, from the raw input
          const w = (H: number): number => input.h.reduce((s, x) => s + (x > H ? x - H : 0), 0);
          expect(w(num(vars.H)) < w(num(vars.Hold))).toBe(true);
          expect(got).toBe(1); // "goes down"
        } else {
          const enough = input.h.reduce((s, x) => s + Math.max(0, x - num(vars.mid)), 0) >= input.m;
          expect(got).toBe(enough ? 0 : 1); // enough -> lo changes; short -> hi changes
          // and it really is what the next check sees
          const nextCheck = fs.slice(frame + 1).find((f) => beatTags(f).includes('check'));
          const after = nextCheck ? nextCheck.meta.vars! : fs[fs.length - 1].meta.vars!;
          expect(got === 0 ? after.lo : after.hi).toBe(got === 0 ? vars.lo : vars.hi);
        }
      }
    }
  });

  it('answer() is pure: same frames, same index; missing vars give -1, not a crash', () => {
    const fs = frames(entry.presets[0].input);
    for (const { id, frame } of beatsOf(fs)) {
      const predict = entry.beatDefs.find((b) => b.id === id)?.ask?.predict;
      if (!predict) continue;
      expect(predict.answer(fs[frame], fs[frame + 1])).toBe(
        predict.answer(fs[frame], fs[frame + 1]),
      );
      const bare = { state: fs[frame].state, meta: { index: 0, explanation: '' } };
      expect(predict.answer(bare, undefined)).toBe(-1);
    }
  });
});

describe('bs-answer-mini: frames', () => {
  it('frame count <= 2*(floor(log2 max h)+1) + 6, and within maxFrames', () => {
    let worst = 0;
    for (const input of family()) {
      const n = frames(input).length;
      const bound = 2 * bits(Math.max(...input.h)) + 6;
      expect(n, JSON.stringify(input)).toBeLessThanOrEqual(bound);
      worst = Math.max(worst, n);
    }
    expect(worst).toBeLessThanOrEqual(entry.maxFrames);
  });

  it('indices are continuous and the engine accepts maxFrames', () => {
    const fs = frames(entry.presets[0].input);
    fs.forEach((f, i) => expect(f.meta.index).toBe(i));
  });

  it('codeLine is inside the pseudocode; state is bars over the input', () => {
    for (const p of entry.presets) {
      for (const f of frames(p.input)) {
        const line = f.meta.codeLine;
        expect(line === undefined || (line >= 1 && line <= entry.code.pseudo.length)).toBe(true);
        expect(f.state.mode).toBe('bars');
        expect(f.state.values).toEqual(p.input.h);
        const th = f.state.threshold;
        if (th) {
          expect(th.label).toBe('H');
          expect(th.value).toBeGreaterThanOrEqual(0);
          expect(th.value).toBeLessThanOrEqual(Math.max(...p.input.h));
        }
        for (const key of Object.keys(f.meta.highlights ?? {})) {
          expect(Number(key)).toBeLessThan(p.input.h.length);
          // only trees taller than H are highlighted
          expect(p.input.h[Number(key)]).toBeGreaterThan(th!.value);
        }
      }
    }
  });

  it('wood shown on screen adds up: aux items sum to vars.got', () => {
    for (const p of entry.presets) {
      for (const f of frames(p.input)) {
        const aux = f.meta.aux?.find((a) => a.id === 'cut');
        const got = f.meta.vars?.got;
        if (aux && got !== undefined) {
          expect(aux.items.reduce<number>((s, x) => s + num(x), 0)).toBe(got);
        }
      }
    }
  });

  it('explanation: non-empty, <= 160 chars, integers come from h, indices or vars', () => {
    for (const input of [...entry.presets.map((p) => p.input), ...family().slice(0, 150)]) {
      for (const locale of LOCALES) {
        for (const f of frames(input, locale)) {
          const text = f.meta.explanation;
          expect(text.length).toBeGreaterThan(0);
          expect(text.length).toBeLessThanOrEqual(160);
          const allowed = new Set<number>([
            ...input.h,
            input.m,
            ...input.h.map((_, i) => i),
            ...Object.values(f.meta.vars ?? {}).map(Number),
          ]);
          for (const tok of text.match(/\d+/g) ?? []) {
            expect(allowed.has(Number(tok)), `${locale}: "${text}" has ${tok}`).toBe(true);
          }
        }
      }
    }
  });

  it('the two locales differ in text but not in frames', () => {
    const a = frames(entry.presets[0].input, 'vi-VN');
    const b = frames(entry.presets[0].input, 'en-US');
    expect(a.map((f) => f.state)).toEqual(b.map((f) => f.state));
    expect(a.map((f) => f.meta.vars)).toEqual(b.map((f) => f.meta.vars));
    expect(a[0].meta.explanation).not.toBe(b[0].meta.explanation);
  });
});

describe('bs-answer-mini: code', () => {
  for (const lang of ['cpp', 'py'] as const) {
    it(`map.${lang} is total over pseudo lines and points inside the code`, () => {
      const map = entry.code.map[lang];
      const len = entry.code.impl[lang].length;
      const pseudoLines = entry.code.pseudo.map((_, i) => i + 1);
      expect(
        Object.keys(map)
          .map(Number)
          .sort((a, b) => a - b),
      ).toEqual(pseudoLines);
      for (const line of pseudoLines) {
        expect(map[line].length, `pseudo ${line}`).toBeGreaterThan(0);
        for (const target of map[line]) {
          expect(Number.isInteger(target) && target >= 1 && target <= len).toBe(true);
        }
      }
    });
  }

  it('pseudo has 7 lines, C++ 14, Python 11; no leftover line-number comments', () => {
    expect(entry.code.pseudo).toHaveLength(7);
    expect(entry.code.impl.cpp).toHaveLength(14);
    expect(entry.code.impl.py).toHaveLength(11);
    for (const line of entry.code.impl.cpp) expect(line).not.toMatch(/\/\/\s*\d+\s*$/);
    for (const line of entry.code.impl.py) expect(line).not.toMatch(/#\s*\d+\s*$/);
  });

  it('C++ uses long long for the total and rounds mid up; Python uses //', () => {
    const cpp = entry.code.impl.cpp.join('\n');
    const py = entry.code.impl.py.join('\n');
    expect(cpp).toContain('long long');
    expect(cpp).toContain('(hi - lo + 1) / 2');
    expect(py).toContain('(lo + hi + 1) // 2');
  });
});
