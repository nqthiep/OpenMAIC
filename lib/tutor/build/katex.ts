/**
 * Server-side KaTeX for walkthrough text (task 3B-K1, contract of 3B-Q8). A catalog string may hold
 * `\( tex \)`. Every distinct `tex` is rendered here with `katex.renderToString` into a table
 * `math: { [tex]: html }` that goes into `walkthrough-data`; the iframe never parses TeX (it only inserts these
 * HTML pieces, see lib/tutor/runtime/rich-text.ts). The CSS with inlined fonts is added to the page only when
 * the table is not empty, so an entry without formulas builds the same page as before.
 * Server-side only. Output is deterministic (no `Date`, no random).
 */
import katex from 'katex';
import { safeKatexOptions } from '@openmaic/dsl';
import { KATEX_INLINE_CSS } from '@/lib/tutor/build/generated/katex-inline';
import { splitMath, type MathTable } from '@/lib/tutor/runtime/rich-text';

/** Longest formula we render; longer ones stay as source text (a runaway macro cannot slow the build). */
export const MAX_TEX_CHARS = 300;
export const MAX_FORMULAS = 120;

export interface MathSegment {
  /** `null` for plain text */
  readonly tex: string | null;
  /** the text of a plain part; the HTML of a formula part (or its source when KaTeX could not render it) */
  readonly html: string;
  readonly text: string;
}

/** HTML of one formula, or `null` when it is too long or KaTeX throws. `trust: false`, no macros from the text. */
export function renderTex(tex: string): string | null {
  if (tex.length > MAX_TEX_CHARS) return null;
  try {
    return katex.renderToString(
      tex,
      safeKatexOptions({
        throwOnError: true,
        strict: 'ignore',
        output: 'htmlAndMathml',
        maxExpand: 100,
        maxSize: 20,
      }),
    );
  } catch {
    return null;
  }
}

/** Cut `text` at `\( … \)`; formula parts carry their rendered HTML (`null` html parts are listed as source text). */
export function renderMathSegments(text: string): MathSegment[] {
  return splitMath(text).map((p) => {
    if (p.tex === null) return { tex: null, html: '', text: p.text };
    const html = renderTex(p.tex);
    return html === null
      ? { tex: null, html: '', text: p.text } // could not render: shown as source text
      : { tex: p.tex, html, text: p.text };
  });
}

/** Strings found anywhere in `value` (arrays and plain objects), in a stable order. */
function strings(value: unknown, out: string[], depth = 0): void {
  if (typeof value === 'string') out.push(value);
  else if (depth > 8) return;
  else if (Array.isArray(value)) for (const v of value) strings(v, out, depth + 1);
  else if (value !== null && typeof value === 'object') {
    for (const k of Object.keys(value).sort())
      strings((value as Record<string, unknown>)[k], out, depth + 1);
  }
}

/**
 * The `math` table for every formula in `values` (any strings, deeply). Empty object when there is none.
 * Formulas KaTeX cannot render are left out (the iframe then shows their source text).
 */
export function buildMathTable(values: readonly unknown[]): MathTable {
  const found: string[] = [];
  strings(values, found);
  const table: Record<string, string> = {};
  for (const text of found) {
    for (const p of splitMath(text)) {
      if (p.tex === null || Object.hasOwn(table, p.tex)) continue;
      if (Object.keys(table).length >= MAX_FORMULAS) throw new Error('too-many-formulas');
      const html = renderTex(p.tex);
      if (html !== null) table[p.tex] = html;
    }
  }
  return table;
}

/** CSS with the inlined KaTeX fonts; add it to the page only when `buildMathTable` returned a formula. */
export function katexCss(): string {
  return KATEX_INLINE_CSS;
}
