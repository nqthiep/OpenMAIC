/**
 * The manim-service is written in Python, so its cache key and its parameter check must agree with the TypeScript ones
 * to the byte. This test writes `manim/service/fixtures/parity.json` (run with UPDATE_FIXTURES=1) and otherwise checks that
 * the committed file is current; the pytest suite of the service replays the same cases.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clipCacheKey } from '@/lib/clips/cache-key';
import { CLIP_IMAGE_DIGEST, CLIP_PROFILE } from '@/lib/clips/assets';
import { clipSpecs } from '@/lib/clips/service-specs';
import { mathClipModules } from '@/lib/subjects/math/clips';
import { parseInput } from '@/lib/tutor/input-spec';

const FILE = join(process.cwd(), 'manim/service/fixtures/parity.json');
const specs = clipSpecs();

/** inputs with float noise and boundary values, on top of every preset */
function keyCases() {
  const out: unknown[] = [];
  for (const { entry } of mathClipModules) {
    const spec = specs.templates[entry.id];
    const inputs: unknown[] = entry.presets.map((p) => p.input);
    // a noisy copy of a preset: numbers nudged by float error (quantisation must remove it)
    inputs.push(
      JSON.parse(JSON.stringify(entry.presets[0].input), (_k, v) =>
        typeof v === 'number' && !Number.isInteger(v) ? v + 1e-12 : v,
      ),
    );
    for (const params of inputs) {
      for (const locale of [null, 'vi-VN']) {
        const parts = {
          templateId: entry.id,
          templateRev: entry.engine.templateRev,
          params,
          spec: spec.inputSpec,
          locale: locale ?? 'vi-VN',
          bakedText: locale !== null,
          profile: CLIP_PROFILE,
          imageDigest: CLIP_IMAGE_DIGEST,
        };
        out.push({
          templateId: entry.id,
          templateRev: entry.engine.templateRev,
          params,
          locale,
          profile: CLIP_PROFILE,
          imageDigest: CLIP_IMAGE_DIGEST,
          inputSpec: spec.inputSpec,
          key: clipCacheKey(parts),
        });
      }
    }
  }
  return out;
}

/** parameter cases: the presets are valid, and a few corrupted copies are not */
function paramCases() {
  const out: { templateId: string; params: unknown; valid: boolean }[] = [];
  for (const { entry } of mathClipModules) {
    const spec = specs.templates[entry.id].inputSpec;
    for (const p of entry.presets) {
      out.push({ templateId: entry.id, params: p.input, valid: parseInput(spec, p.input).ok });
      const asRecord = p.input as Record<string, unknown>;
      out.push({
        templateId: entry.id,
        params: { ...asRecord, extraField: 1 },
        valid: parseInput(spec, { ...asRecord, extraField: 1 }).ok,
      });
      for (const bad of [null, [], 'x', {}, 7])
        out.push({ templateId: entry.id, params: bad, valid: parseInput(spec, bad).ok });
      const first = Object.keys(asRecord)[0];
      for (const wrong of ['7', 1e9, -1e9, 0.5, null, {}]) {
        const mutated = { ...asRecord, [first]: wrong };
        out.push({ templateId: entry.id, params: mutated, valid: parseInput(spec, mutated).ok });
      }
    }
  }
  return out;
}

const current = () => ({ keys: keyCases(), params: paramCases() });

describe('service parity fixtures', () => {
  it('are current (regenerate with UPDATE_FIXTURES=1)', () => {
    const text = `${JSON.stringify(current(), null, 2)}\n`;
    if (process.env.UPDATE_FIXTURES === '1') writeFileSync(FILE, text);
    expect(readFileSync(FILE, 'utf8')).toBe(text);
  });

  it('cover every clip, with both valid and invalid parameters', () => {
    const f = current();
    const ids = new Set(mathClipModules.map((m) => m.entry.id));
    expect(new Set(f.keys.map((k) => (k as { templateId: string }).templateId))).toEqual(ids);
    expect(f.params.some((c) => c.valid)).toBe(true);
    expect(f.params.some((c) => !c.valid)).toBe(true);
    // the same parameters with and without baked text give different keys; float noise gives the same key as the clean value
    const key = (id: string, loc: string | null, i: number) =>
      (f.keys as { templateId: string; locale: string | null; key: string }[]).filter(
        (k) => k.templateId === id && k.locale === loc,
      )[i].key;
    const id = mathClipModules[0].entry.id;
    expect(key(id, null, 0)).not.toBe(key(id, 'vi-VN', 0));
  });

  it('the exported specs match the committed templates.json', () => {
    expect(readFileSync(join(process.cwd(), 'manim/service/templates.json'), 'utf8')).toBe(
      `${JSON.stringify(specs, null, 2)}\n`,
    );
  });
});
