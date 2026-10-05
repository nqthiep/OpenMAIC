import { describe, expect, it } from 'vitest';
import { binarySearchEntry as entry } from '@/lib/subjects/cp/catalog/binary-search';
import { fill, hasRequiredLocales, msg, unresolved } from '@/lib/tutor/catalog/messages';
import type { Messages } from '@/lib/tutor/catalog/types';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';

type In = { values: number[]; target: number };
type S = { values: number[]; mode: 'bars' };

const LOCALES = ['vi-VN', 'en-US'] as const;
const VAR_NAMES = ['lo', 'hi', 'mid', 'amid', 'target'];

const gen = (input: In, locale: string = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beatOf = (f: Frame<S>): string[] =>
  (f.meta.tags ?? []).filter((t) => t.startsWith('beat:')).map((t) => t.slice(5));
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const frameBound = (n: number): number => 4 * (Math.floor(Math.log2(n)) + 1) + 2;

/** Every sorted subset of 0..width-1 (as strictly increasing arrays) crossed with every target. */
function* exhaustive(width: number): Generator<In> {
  for (let mask = 1; mask < 1 << width; mask++) {
    const values: number[] = [];
    for (let i = 0; i < width; i++) if (mask & (1 << i)) values.push(i);
    for (let target = -1; target <= width; target++) yield { values, target };
  }
}

/** n=12 arrays with the widest numbers, every target near them. */
const WIDE: In[] = [
  { values: Array.from({ length: 12 }, (_, i) => -999 + i), target: -999 },
  { values: Array.from({ length: 12 }, (_, i) => 988 + i), target: 999 },
  { values: Array.from({ length: 12 }, (_, i) => -999 + i), target: 999 },
  { values: Array.from({ length: 12 }, (_, i) => 988 + i), target: -999 },
];

describe('binarySearchEntry static fields', () => {
  it('matches SCHEMA §4.1', () => {
    expect(entry.id).toBe('binary-search');
    expect(entry.entryRev).toBe(1);
    expect(entry.subject).toBe('cp');
    expect(entry.visualizer).toBe('array');
    expect(entry.curriculumTopics).toEqual(['t2-binary-search']);
    expect(entry.customInput).toBe(false);
    expect(entry.maxFrames).toBe(60);
    expect(entry.maxBytes).toBe(200_000);
    expect(entry.code.pseudo).toHaveLength(7);
    expect(entry.code.impl.cpp).toHaveLength(10);
    expect(entry.code.impl.py).toHaveLength(10);
    expect(entry.beatDefs.map((b) => b.id)).toEqual([
      'start',
      'mid',
      'go-right',
      'go-left',
      'done',
    ]);
  });

  it('keeps meaning comments but no line-number comments in real code', () => {
    for (const line of [...entry.code.impl.cpp, ...entry.code.impl.py])
      expect(line).not.toMatch(/(\/\/|#)\s*\d+\s*$/);
  });
});

describe('run: result', () => {
  it('last frame agrees with values.indexOf(target), exhaustively on small arrays', () => {
    let runs = 0;
    for (const input of exhaustive(8)) {
      const frames = gen(input);
      const last = frames[frames.length - 1];
      const hit = Object.entries(last.meta.highlights ?? {}).find(([, k]) => k === 'result');
      expect(hit ? Number(hit[0]) : -1).toBe(input.values.indexOf(input.target));
      expect(beatOf(last)).toEqual(['done']);
      runs++;
    }
    expect(runs).toBeGreaterThan(2000);
  });

  it('preset last frames are right', () => {
    for (const p of entry.presets) {
      const frames = gen(p.input);
      const last = frames[frames.length - 1];
      const idx = p.input.values.indexOf(p.input.target);
      if (idx >= 0) {
        expect(last.meta.highlights?.[idx]).toBe('result');
        expect(last.meta.vars?.mid).toBe(idx);
      } else {
        expect(Object.values(last.meta.highlights ?? {})).not.toContain('result');
        expect((last.meta.vars?.lo as number) > (last.meta.vars?.hi as number)).toBe(true);
      }
    }
  });

  it('absent target', () => {
    const frames = gen({ values: [1, 5, 9], target: 6 });
    const last = frames[frames.length - 1];
    expect(beatOf(last)).toEqual(['done']);
    expect(last.meta.codeLine).toBe(7);
    expect(Object.values(last.meta.highlights ?? {}).every((k) => k === 'muted')).toBe(true);
  });

  it('n = 1: hit and miss on both sides', () => {
    expect(beats(gen({ values: [7], target: 7 }))).toEqual(['start', 'mid', 'done']);
    expect(beats(gen({ values: [7], target: 3 }))).toEqual(['start', 'mid', 'go-left', 'done']);
    expect(beats(gen({ values: [7], target: 9 }))).toEqual(['start', 'mid', 'go-right', 'done']);
    const left = gen({ values: [7], target: 3 });
    expect(left[left.length - 1].meta.vars).toMatchObject({ lo: 0, hi: -1 });
  });

  it('is deterministic and does not mutate its input', () => {
    for (const p of entry.presets) {
      const input = structuredClone(p.input);
      const before = JSON.stringify(input);
      const a = gen(input);
      expect(JSON.stringify(input)).toBe(before);
      expect(gen(input)).toEqual(a);
      // run() directly on a deeply frozen input must not write to it
      const frozen = { values: Object.freeze([...input.values]) as number[], target: input.target };
      Object.freeze(frozen);
      expect(() =>
        entry.run(
          frozen,
          () => {},
          () => {},
          { locale: 'en-US' },
        ),
      ).not.toThrow();
    }
  });
});

describe('run: frame shape', () => {
  const all: In[] = [...entry.presets.map((p) => p.input), ...WIDE, ...exhaustive(5)];

  it('codeLine, vars, pointers, tags are well-formed', () => {
    for (const input of all) {
      const frames = gen(input);
      frames.forEach((f, i) => {
        expect(f.meta.index).toBe(i);
        expect(f.meta.codeLine).toBeGreaterThanOrEqual(1);
        expect(f.meta.codeLine).toBeLessThanOrEqual(entry.code.pseudo.length);
        expect(f.state).toEqual({ values: input.values, mode: 'bars' });
        for (const k of Object.keys(f.meta.vars ?? {})) expect(VAR_NAMES).toContain(k);
        for (const k of Object.keys(f.meta.pointers ?? {}))
          expect(['lo', 'hi', 'mid']).toContain(k);
        expect(f.meta.vars?.target).toBe(input.target);
        expect(f.meta.tags?.length ?? 0).toBeLessThanOrEqual(1);
      });
      expect(beatOf(frames[0])).toEqual(['start']);
      expect(beatOf(frames[frames.length - 1])).toEqual(['done']);
    }
  });

  it('every mid tag has mid/amid in vars and amid = values[mid]', () => {
    for (const input of all) {
      for (const f of gen(input)) {
        if (!beatOf(f).includes('mid')) continue;
        const { mid, amid } = f.meta.vars ?? {};
        expect(f.meta.pointers?.mid).toBe(mid);
        expect(input.values[mid as number]).toBe(amid);
      }
    }
  });

  it('frame count <= 4*(floor(log2 n)+1)+2 and <= entry.maxFrames [Unverified bound]', () => {
    let worst = 0;
    for (const input of [...all, ...exhaustive(8)]) {
      const frames = gen(input);
      expect(frames.length).toBeLessThanOrEqual(frameBound(input.values.length));
      expect(frames.length).toBeLessThanOrEqual(entry.maxFrames);
      worst = Math.max(worst, frames.length);
    }
    expect(worst).toBeGreaterThan(0);
  });

  it('n = 12 worst case stays within the bound', () => {
    const values = Array.from({ length: 12 }, (_, i) => i * 2);
    let worst = 0;
    for (let target = -1; target <= 24; target++)
      worst = Math.max(worst, gen({ values, target }).length);
    expect(worst).toBeLessThanOrEqual(frameBound(12));
  });
});

describe('input validation', () => {
  it('presets are valid', () => {
    for (const p of entry.presets) {
      expect(validateInput(entry, p.input)).toEqual({ ok: true, value: p.input });
    }
  });

  it('rejects non-strictly-increasing values', () => {
    expect(validateInput(entry, { values: [1, 1, 2], target: 1 }).ok).toBe(false);
    expect(validateInput(entry, { values: [3, 2], target: 1 }).ok).toBe(false);
  });

  it('rejects other bad shapes', () => {
    expect(validateInput(entry, { values: [], target: 1 }).ok).toBe(false);
    expect(
      validateInput(entry, { values: Array.from({ length: 13 }, (_, i) => i), target: 1 }).ok,
    ).toBe(false);
    expect(validateInput(entry, { values: [1000], target: 1 }).ok).toBe(false);
    expect(validateInput(entry, { values: [1], target: 1.5 }).ok).toBe(false);
    expect(validateInput(entry, { values: [1] }).ok).toBe(false);
    expect(validateInput(entry, { values: [1], target: 1, extra: 1 }).ok).toBe(false);
  });
});

describe('code maps', () => {
  it.each([
    ['cpp', entry.code.map.cpp, entry.code.impl.cpp],
    ['py', entry.code.map.py, entry.code.impl.py],
  ] as const)('map.%s is total and in range', (_lang, map, impl) => {
    for (let line = 1; line <= entry.code.pseudo.length; line++) {
      const targets = map[line];
      expect(targets, `pseudo line ${line}`).toBeDefined();
      expect(targets.length).toBeGreaterThan(0);
      for (const t of targets) {
        expect(Number.isInteger(t)).toBe(true);
        expect(t).toBeGreaterThanOrEqual(1);
        expect(t).toBeLessThanOrEqual(impl.length);
      }
    }
    // no stray keys beyond the pseudo lines
    expect(Object.keys(map).map(Number).sort()).toEqual(
      Array.from({ length: entry.code.pseudo.length }, (_, i) => i + 1),
    );
  });

  it('matches the SCHEMA §4.1 maps', () => {
    expect(entry.code.map.cpp).toEqual({ 1: [2], 2: [3], 3: [4], 4: [5], 5: [6], 6: [7], 7: [9] });
    expect(entry.code.map.py).toEqual({
      1: [2],
      2: [3],
      3: [4],
      4: [5, 6],
      5: [7, 8],
      6: [9],
      7: [10],
    });
  });
});

describe('presets and beats', () => {
  it('has the four presets', () => {
    expect(entry.presets.map((p) => p.id)).toEqual(['mid-hit', 'first', 'absent', 'single']);
    expect(new Set(entry.presets.map((p) => p.id)).size).toBe(entry.presets.length);
  });

  it('mid-hit lands on the first mid; single has n = 1', () => {
    const mid = entry.presets.find((p) => p.id === 'mid-hit')!;
    expect(beats(gen(mid.input))).toEqual(['start', 'mid', 'done']);
    expect(entry.presets.find((p) => p.id === 'single')!.input.values).toHaveLength(1);
    const first = entry.presets.find((p) => p.id === 'first')!;
    expect(first.input.target).toBe(first.input.values[0]);
    const absent = entry.presets.find((p) => p.id === 'absent')!;
    expect(absent.input.values).not.toContain(absent.input.target);
  });

  it('every preset contains every required beat', () => {
    const required = entry.beatDefs.filter((b) => b.required).map((b) => b.id);
    expect(required).toEqual(['start', 'done']);
    for (const p of entry.presets) {
      const seen = beats(gen(p.input));
      for (const id of required) expect(seen, `${p.id}:${id}`).toContain(id);
    }
  });

  it('every emitted beat tag is a beatDef and every beatDef is used by a preset', () => {
    const ids = entry.beatDefs.map((b) => b.id);
    const count = new Map<string, number>(ids.map((id) => [id, 0]));
    for (const p of entry.presets) {
      for (const b of beats(gen(p.input))) {
        expect(ids).toContain(b);
        count.set(b, (count.get(b) ?? 0) + 1);
      }
    }
    for (const id of ids) expect(count.get(id), id).toBeGreaterThanOrEqual(1);
  });

  it('beat order: mid is always followed by go-* or done', () => {
    for (const p of entry.presets) {
      const seq = beats(gen(p.input));
      seq.forEach((b, i) => {
        if (b === 'mid') expect(['go-left', 'go-right', 'done']).toContain(seq[i + 1]);
      });
    }
  });

  it('beatDefs shape: hints[3], mid has predict, 5..10 beats', () => {
    expect(entry.beatDefs.length).toBeGreaterThanOrEqual(5);
    expect(entry.beatDefs.length).toBeLessThanOrEqual(10);
    for (const b of entry.beatDefs) {
      expect(b.hints, b.id).toHaveLength(3);
      expect(b.misconceptions?.length ?? 0, b.id).toBeGreaterThanOrEqual(1);
    }
    const mid = entry.beatDefs.find((b) => b.id === 'mid')!;
    expect(mid.ask?.predict).toMatchObject({ kind: 'choice', answerFrom: 'next-frame' });
    expect(mid.ask?.predict?.options).toHaveLength(2);
  });

  it('pitfalls: cpp overflow and py // on beat mid, plus a generic one', () => {
    const p = entry.pitfalls ?? [];
    expect(p.some((x) => x.lang === 'cpp' && x.beat === 'mid')).toBe(true);
    expect(p.some((x) => x.lang === 'py' && x.beat === 'mid')).toBe(true);
    expect(p.some((x) => x.lang === undefined)).toBe(true);
    for (const x of p) if (x.beat) expect(entry.beatDefs.map((b) => b.id)).toContain(x.beat);
  });
});

describe('texts', () => {
  const allMessages = (): [string, Messages][] => {
    const out: [string, Messages][] = [['title', entry.title]];
    for (const p of entry.presets) out.push([`preset:${p.id}`, p.label]);
    for (const b of entry.beatDefs) {
      out.push([`${b.id}.label`, b.label], [`${b.id}.narration`, b.narration]);
      if (b.ask) out.push([`${b.id}.ask`, b.ask.text]);
      b.ask?.predict?.options?.forEach((o, i) => out.push([`${b.id}.option${i}`, o]));
      b.hints?.forEach((h, i) => out.push([`${b.id}.hint${i}`, h]));
      b.misconceptions?.forEach((x, i) => out.push([`${b.id}.misc${i}`, x]));
    }
    (entry.pitfalls ?? []).forEach((x, i) => out.push([`pitfall${i}`, x.text]));
    return out;
  };

  it('every Messages has non-empty vi-VN and en-US', () => {
    for (const [name, text] of allMessages()) expect(hasRequiredLocales(text), name).toBe(true);
  });

  it('narration only uses vars the frames provide', () => {
    for (const b of entry.beatDefs)
      for (const l of LOCALES)
        for (const tok of unresolved(msg(b.narration, l)))
          expect(VAR_NAMES, `${b.id}/${l}`).toContain(tok.slice(1, -1));
  });

  it('fill(narration, vars) leaves no {…} at any beat of any preset, both locales', () => {
    for (const p of entry.presets) {
      for (const l of LOCALES) {
        for (const f of gen(p.input, l)) {
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

  it('explanation is non-empty, <= 160 chars, placeholder-free, differs per locale', () => {
    const inputs = [...entry.presets.map((p) => p.input), ...WIDE, ...exhaustive(4)];
    for (const input of inputs) {
      const vi = gen(input, 'vi-VN');
      const en = gen(input, 'en-US');
      expect(vi.length).toBe(en.length);
      vi.forEach((f, i) => {
        for (const e of [f.meta.explanation, en[i].meta.explanation]) {
          expect(e.length).toBeGreaterThan(0);
          expect(e.length).toBeLessThanOrEqual(160);
          expect(unresolved(e)).toEqual([]);
        }
        expect(f.meta.explanation).not.toBe(en[i].meta.explanation);
      });
    }
  });

  it('unknown locale falls back to en-US', () => {
    const input = entry.presets[0].input;
    expect(gen(input, 'fr-FR').map((f) => f.meta.explanation)).toEqual(
      gen(input, 'en-US').map((f) => f.meta.explanation),
    );
  });

  it('every integer in explanation is in values, an index, or the frame vars', () => {
    // -1 is the literal returned by pseudo line 7 (not-found sentinel), allowed explicitly.
    const inputs = [...entry.presets.map((p) => p.input), ...WIDE, ...exhaustive(5)];
    for (const input of inputs) {
      for (const l of LOCALES) {
        for (const f of gen(input, l)) {
          const allowed = new Set<number>([
            -1,
            ...input.values,
            ...input.values.map((_, i) => i),
            ...Object.values(f.meta.vars ?? {}).filter((v): v is number => typeof v === 'number'),
          ]);
          const nums = f.meta.explanation.replace(/−/g, '-').match(/-?\d+/g) ?? [];
          for (const n of nums)
            expect(allowed.has(Number(n)), `${l} "${f.meta.explanation}" has ${n}`).toBe(true);
        }
      }
    }
  });
});
