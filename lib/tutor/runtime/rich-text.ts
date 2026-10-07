/**
 * Text with formulas (task 3B-Q8/K1). A catalog string may hold `\( tex \)` segments. The server renders each
 * distinct `tex` with KaTeX into a table `math: { [tex]: html }` (lib/tutor/build/katex.ts); the iframe never
 * parses TeX. Here `splitMath` cuts a string into text and formula parts (the same cut runs on the server and
 * in the iframe), and `setRichText` puts the parts into the DOM: plain text through `textContent`/text nodes,
 * and only the server-made HTML of a formula, through a `<template>`. Browser-safe: no Node API.
 */

export type MathTable = Readonly<Record<string, string>>;

export interface TextPart {
  /** `tex` of a formula part, `null` for plain text */
  readonly tex: string | null;
  readonly text: string;
}

const MATH = /\\\(([\s\S]+?)\\\)/g;

/** Cut `text` at `\( … \)`. Unclosed or empty `\(` stays plain text. Formula parts keep the trimmed `tex`. */
export function splitMath(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH)) {
    const tex = m[1].trim();
    if (tex === '') continue;
    const at = m.index ?? 0;
    if (at > last) parts.push({ tex: null, text: text.slice(last, at) });
    parts.push({ tex, text: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ tex: null, text: text.slice(last) });
  return parts;
}

export function hasMath(text: string): boolean {
  return splitMath(text).some((p) => p.tex !== null);
}

/**
 * Fill `el` with `text`. Without a table, or without a formula in `text`, this is exactly `textContent = text`.
 * A formula whose `tex` is not in the table is shown as its source text, never as markup.
 */
export function setRichText(el: HTMLElement, text: string, math?: MathTable): void {
  if (!math || !hasMath(text)) {
    el.textContent = text;
    return;
  }
  const doc = el.ownerDocument;
  const nodes: Node[] = [];
  for (const part of splitMath(text)) {
    const html =
      part.tex !== null && Object.prototype.hasOwnProperty.call(math, part.tex)
        ? math[part.tex]
        : null;
    if (html === null) {
      nodes.push(doc.createTextNode(part.text));
      continue;
    }
    const tpl = doc.createElement('template');
    tpl.innerHTML = html; // server-rendered KaTeX of the catalog author's formula, never user input
    nodes.push(tpl.content);
  }
  el.replaceChildren(...nodes);
}
