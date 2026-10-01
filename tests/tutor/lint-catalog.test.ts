import { beforeAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

/**
 * Deterministic-catalog lint rules (ADR 0006 decision 7). Runs the real eslint
 * against the real eslint.config.mjs on in-memory text.
 */

const NEW_RULES = ['no-restricted-globals', 'no-restricted-properties'];
const CATALOG = 'lib/subjects/cp/catalog/__probe.ts';
const OUTSIDE = 'lib/subjects/cp/pack.ts';

const FORBIDDEN: Record<string, string> = {
  Intl: 'export const a = new Intl.NumberFormat();\n',
  Date: 'export const a = Date.now();\n',
  'Math.random': 'export const a = Math.random();\n',
  'Math.sin': 'export const a = Math.sin(1);\n',
  'Math.cos': 'export const a = Math.cos(1);\n',
  'Math.tan': 'export const a = Math.tan(1);\n',
  'Math.exp': 'export const a = Math.exp(1);\n',
  'Math.log': 'export const a = Math.log(1);\n',
  'Math.log2': 'export const a = Math.log2(8);\n',
  'Math.log10': 'export const a = Math.log10(100);\n',
  'Math.pow': 'export const a = Math.pow(2, 3);\n',
  toLocaleString: 'export const a = (1).toLocaleString();\n',
  localeCompare: "export const a = 'a'.localeCompare('b');\n",
};

const ALLOWED: Record<string, string> = {
  'Math.floor': 'export const a = Math.floor(1.5);\n',
  'Math.max': 'export const a = Math.max(1, 2);\n',
  '**': 'export const f = (a: number) => a ** 2;\n',
};

const eslint = new ESLint({ cwd: process.cwd() });

async function newRuleErrors(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false });
  return (result?.messages ?? [])
    .filter((m) => m.severity === 2 && NEW_RULES.includes(m.ruleId ?? ''))
    .map((m) => m.ruleId as string);
}

describe('catalog determinism lint', () => {
  // The first lint call loads the full config and parser; warm it up once.
  beforeAll(async () => {
    await newRuleErrors(CATALOG, 'export const a = 1;\n');
  }, 120_000);

  for (const [name, code] of Object.entries(FORBIDDEN)) {
    it(`rejects ${name} in catalog`, async () => {
      expect(await newRuleErrors(CATALOG, code)).not.toHaveLength(0);
    });
    it(`does not apply the catalog rule to ${name} outside catalog`, async () => {
      expect(await newRuleErrors(OUTSIDE, code)).toEqual([]);
    });
  }

  for (const [name, code] of Object.entries(ALLOWED)) {
    it(`allows ${name} in catalog`, async () => {
      const [result] = await eslint.lintText(code, { filePath: CATALOG, warnIgnored: false });
      expect((result?.messages ?? []).filter((m) => m.severity === 2)).toEqual([]);
    });
  }
});
