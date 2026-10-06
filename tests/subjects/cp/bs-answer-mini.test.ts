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
/** Beat tags per preset (the provider narrates at most 12 and always keeps the last required beat). */
const BEAT_COUNTS: Record<string, number> = {
  classic: 12,
  'all-equal': 8,
  'one-tree': 14,
  'take-all': 10,
  'tiny-need': 12,
};

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
    expect(entry.entryRev).toBe(2);
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
      'init',
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

  it('beat order: brute, monotonic, init, then (check, narrow)+, then done only at the end', () => {
    for (const input of family()) {
      const ids = beatsOf(frames(input)).map((b) => b.id);
      expect(ids.slice(0, 3), JSON.stringify(input)).toEqual(['brute', 'monotonic', 'init']);
      expect(ids[ids.length - 1]).toBe('done');
      expect(ids.filter((x) => x === 'done')).toHaveLength(1);
      const mid = ids.slice(3, -1);
      expect(mid.length).toBeGreaterThanOrEqual(2);
      expect(mid.every((x, i) => x === (i % 2 === 0 ? 'check' : 'narrow'))).toBe(true);
    }
  });

  it('brute is tagged on the LAST attempt, whose narration covers every try', () => {
    for (const input of family()) {
      const fs = frames(input);
      const brute = fs.filter((f) => f.meta.codeLine === 1 && f.meta.vars?.tried !== undefined);
      expect(brute, JSON.stringify(input)).toHaveLength(1);
      const at = fs.indexOf(brute[0]);
      expect(beatTags(fs[at])).toEqual(['brute']);
      // every earlier brute attempt is untagged and its H is listed in `tried`
      const tried = String(brute[0].meta.vars?.tried).split(', ').map(Number);
      expect(tried.length).toBeGreaterThanOrEqual(2);
      expect(tried[0]).toBe(Math.max(...input.h));
      fs.slice(0, at).forEach((f, i) => {
        expect(beatTags(f)).toEqual([]);
        expect(f.meta.vars?.H).toBe(tried[i]);
      });
      expect(brute[0].meta.vars?.H).toBe(tried[tried.length - 1]);
    }
  });

  it('init frame draws the whole range [0, max h] on the H axis', () => {
    for (const p of entry.presets) {
      const fs = frames(p.input);
      const init = fs.find((f) => beatTags(f).includes('init'))!;
      expect(init.meta.vars).toEqual({ lo: 0, hi: Math.max(...p.input.h), m: p.input.m });
      expect(init.meta.codeLine).toBe(2);
      const row = init.meta.aux?.find((a) => a.id === 'range');
      expect(row?.items[0]).toBe(0);
      expect(row?.items[row.items.length - 1]).toBe(Math.max(...p.input.h));
    }
  });

  it('the [lo, hi] band row always starts at lo and ends at hi', () => {
    for (const input of family().slice(0, 200)) {
      for (const f of frames(input)) {
        const row = f.meta.aux?.find((a) => a.id === 'range');
        if (!row) continue;
        expect(row.items[0]).toBe(f.meta.vars?.lo);
        expect(row.items[row.items.length - 1]).toBe(f.meta.vars?.hi);
      }
    }
  });

  it('pseudo lines: mid is line 4 (check), the comparison line 5, assignment 5 or 6', () => {
    for (const input of family().slice(0, 200)) {
      const fs = frames(input);
      fs.forEach((f, i) => {
        const tags = beatTags(f);
        if (tags.includes('check')) expect(f.meta.codeLine).toBe(4);
        if (tags.includes('narrow')) {
          expect(f.meta.codeLine).toBe(5);
          const upd = fs[i + 1];
          expect(upd.meta.codeLine).toBe(upd.meta.vars?.lo !== f.meta.vars?.lo ? 5 : 6);
        }
      });
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

  it('beat tags per preset: the real numbers (one-tree has 14, above the narration cap of 12)', () => {
    const counts = Object.fromEntries(
      entry.presets.map((p) => [p.id, beatsOf(frames(p.input)).length]),
    );
    expect(counts).toEqual(BEAT_COUNTS);
  });
});

describe('bs-answer-mini: predictions', () => {
  const asked = entry.beatDefs.filter((b) => b.ask?.predict);
  const w = (input: BsAnswerMiniInput, H: number): number =>
    input.h.reduce((s, x) => s + (x > H ? x - H : 0), 0);

  it('monotonic, check and narrow ask a choice question with valid options', () => {
    expect(asked.map((b) => b.id)).toEqual(['monotonic', 'check', 'narrow']);
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
        const f = fs[frame];
        const next = fs[frame + 1];
        const got = predict.answer(f, next);
        expect(Number.isInteger(got) && got >= 0 && got < predict.options.length).toBe(true);
        if (id === 'monotonic') {
          // the question frame is at H, the answer frame at H + 1, wood from the raw input
          expect(num(next.meta.vars?.H)).toBe(num(f.meta.vars?.H) + 1);
          expect(w(input, num(next.meta.vars?.H)) < w(input, num(f.meta.vars?.H))).toBe(true);
          expect(got).toBe(1); // "goes down"
        } else if (id === 'check') {
          // the next frame is the result frame of the SAME mid
          expect(next.meta.vars?.mid).toBe(f.meta.vars?.mid);
          expect(got).toBe(w(input, num(f.meta.vars?.mid)) >= input.m ? 0 : 1);
        } else {
          const mid = num(f.meta.vars?.mid);
          const enough = w(input, mid) >= input.m;
          expect(got).toBe(enough ? 0 : 1); // enough -> lo changes; short -> hi changes
          // and it really is what the update frame shows
          expect(next.meta.vars?.lo).toBe(enough ? mid : f.meta.vars?.lo);
          expect(next.meta.vars?.hi).toBe(enough ? f.meta.vars?.hi : mid - 1);
        }
      }
    }
  }, 30_000);

  it('a prediction frame does not display its answer (explanation, vars, aux)', () => {
    for (const input of [...entry.presets.map((p) => p.input), ...family().slice(0, 120)]) {
      for (const locale of LOCALES) {
        const fs = frames(input, locale);
        for (const { id, frame } of beatsOf(fs)) {
          if (!entry.beatDefs.find((b) => b.id === id)?.ask?.predict) continue;
          const f = fs[frame];
          const next = fs[frame + 1];
          const where = `${locale} ${JSON.stringify(input)} ${id}: "${f.meta.explanation}"`;
          const text = f.meta.explanation;
          const keys = Object.keys(f.meta.vars ?? {});
          const auxIds = (f.meta.aux ?? []).map((a) => a.id);
          if (id === 'monotonic') {
            // only the old H and its wood: no raised H, no drop, no words about it
            expect(keys, where).not.toContain('Hold');
            expect(keys, where).not.toContain('gotOld');
            expect(num(f.state.threshold?.value), where).toBe(num(f.meta.vars?.H));
            expect(text, where).not.toMatch(/xuống|giảm|tăng|drops|less|more/);
            expect(next.meta.explanation).toMatch(/xuống|drops/); // revealed one frame later
          } else if (id === 'check') {
            // no wood, no per-tree row, no verdict
            expect(keys, where).not.toContain('got');
            expect(auxIds, where).not.toContain('cut');
            // no "được N mét" / "gives N meters": the wood quantity is not stated
            expect(text, where).not.toMatch(/(được|gives|got) \d+ (mét|meters)/);
            expect(text, where).not.toMatch(/chưa đủ|thiếu|not enough|Đủ gỗ|, enough|Enough/);
          } else {
            // wood and verdict are shown, but the bounds are still the old ones
            expect(keys, where).toContain('got');
            const range = f.meta.aux?.find((a) => a.id === 'range');
            expect(range?.items[0], where).toBe(f.meta.vars?.lo);
            expect(range?.items[range.items.length - 1], where).toBe(f.meta.vars?.hi);
            for (const k of ['lo', 'hi'] as const) {
              const after = next.meta.vars?.[k];
              if (after === f.meta.vars?.[k]) continue;
              expect(text, where).not.toContain(`${k} = ${after}`);
              expect(text, where).not.toContain(`[${next.meta.vars?.lo}, ${next.meta.vars?.hi}]`);
            }
          }
        }
      }
    }
  }, 30_000);

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
  it('frame count <= 3*(floor(log2 max h)+1) + 7, and within maxFrames', () => {
    let worst = 0;
    for (const input of family()) {
      const n = frames(input).length;
      const bound = 3 * bits(Math.max(...input.h)) + 7;
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

  it('en-US wording: meters, "Remaining", a single name m (no M, no metres, no Left)', () => {
    const texts: string[] = [];
    for (const p of entry.presets)
      for (const f of frames(p.input, 'en-US')) texts.push(f.meta.explanation);
    for (const { m } of allMessages()) texts.push(m['en-US']);
    const all = texts.join('\n');
    expect(all).not.toMatch(/metres?\b|\bLeft:|\bM\b/);
    expect(all).toContain('meters');
    expect(all).toContain('Remaining: [');
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

  it('pseudo has 7 lines, C++ 14, Python 11; no comments at all (impl is not localized)', () => {
    expect(entry.code.pseudo).toHaveLength(7);
    expect(entry.code.impl.cpp).toHaveLength(14);
    expect(entry.code.impl.py).toHaveLength(11);
    for (const line of entry.code.impl.cpp) expect(line).not.toContain('//');
    for (const line of entry.code.impl.py) expect(line).not.toContain('#');
  });

  it('C++ uses long long for the total and rounds mid up; Python uses //', () => {
    const cpp = entry.code.impl.cpp.join('\n');
    const py = entry.code.impl.py.join('\n');
    expect(cpp).toContain('long long');
    expect(cpp).toContain('(hi - lo + 1) / 2');
    expect(py).toContain('(lo + hi + 1) // 2');
  });
});
