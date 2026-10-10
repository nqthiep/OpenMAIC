import { moderate, type ModerationCategory, type ModerationVerdict } from '@/lib/tutor/moderation';
import { inventorySlide } from './course-edit/apply';
import type { Action } from '@/lib/types/action';
import type { Scene, SlideContent } from '@/lib/types/stage';
import { isWalkthroughScene } from '@/lib/widgets/policy';

export const CONTENT_BLOCKED_HINT =
  'Generated text was blocked by the content filter. Rewrite the page without the flagged material, or retry later if the filter is unavailable.';
const CHUNK_CHARS = 4000;
const OVERLAP_CHARS = 200;
/** Moderation calls in flight for one scene; the same bound the chat input filter uses. */
const SCENE_CONCURRENCY = 3;
const SLIDE_TEXT_TYPES = new Set(['text', 'shape', 'table', 'latex', 'code']);

export interface ContentBlocked {
  error: 'content-blocked';
  categories: ModerationCategory[];
  hint: string;
}

export interface SceneModerationDeps {
  moderate?: typeof moderate;
  locale?: string;
}

/**
 * The part of an interactive page's html that the screen reads: the whole markup except comments and
 * stylesheets. Text a script writes into the DOM is in the markup, so it is screened too; the markup
 * itself is not cut at `<`, so no text can hide between two angle brackets.
 */
export function htmlScreenText(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ');
}

/**
 * Student-visible text of a scene (pure): slide text/table/shape/latex/code text, quiz question, options and
 * explanation, speech lines, and the html of an interactive page. A walkthrough's html is built from the
 * reviewed catalog and is skipped; its title and speech are still moderated: the `kind` flag is data and
 * not a trust boundary.
 */
export function extractVisibleText(scene: Scene): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  };
  add(scene.title);
  const content = scene.content;
  if (content.type === 'slide') {
    for (const el of inventorySlide(content as SlideContent)) {
      if (SLIDE_TEXT_TYPES.has(el.type)) add(el.text);
    }
  } else if (content.type === 'quiz') {
    for (const q of content.questions) {
      add(q.question);
      q.options?.forEach((o) => add(o.label));
      add(q.analysis);
    }
  } else if (content.type === 'interactive' && !isWalkthroughScene(scene)) {
    const html = (content as { html?: unknown }).html;
    if (typeof html === 'string') add(htmlScreenText(html));
  }
  for (const action of (scene.actions ?? []) as Action[]) {
    if (action.type === 'speech') add(action.text);
  }
  return out;
}

/**
 * Packs the pieces into calls of at most CHUNK_CHARS. A piece longer than that is cut into windows that
 * overlap by OVERLAP_CHARS, so a phrase cut by one window is whole in the next.
 */
function chunk(pieces: readonly string[]): string[] {
  const chunks: string[] = [];
  let cur = '';
  for (const piece of pieces) {
    for (let i = 0; ; i += CHUNK_CHARS - OVERLAP_CHARS) {
      const part = piece.slice(i, i + CHUNK_CHARS);
      if (cur && cur.length + 1 + part.length > CHUNK_CHARS) {
        chunks.push(cur);
        cur = part;
      } else {
        cur = cur ? `${cur}\n${part}` : part;
      }
      if (i + CHUNK_CHARS >= piece.length) break;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** null = allowed; otherwise a `content-blocked` error. Fail-closed (a missing route blocks). */
export async function moderateScene(
  scene: Scene,
  deps: SceneModerationDeps = {},
): Promise<ContentBlocked | null> {
  const mod = deps.moderate ?? moderate;
  const ctx = {
    direction: 'out' as const,
    locale: deps.locale ?? 'vi-VN',
    subject: 'school tutoring',
  };
  const texts = chunk(extractVisibleText(scene));
  let next = 0;
  let blocked = null as ContentBlocked | null;
  const worker = async () => {
    while (!blocked && next < texts.length) {
      const text = texts[next++];
      let verdict: ModerationVerdict;
      try {
        verdict = await mod(text, ctx);
      } catch {
        verdict = { allow: false, categories: [], model: '' };
      }
      if (!verdict.allow && !blocked) {
        blocked = {
          error: 'content-blocked',
          categories: [...verdict.categories],
          hint: CONTENT_BLOCKED_HINT,
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCENE_CONCURRENCY, texts.length) }, worker));
  return blocked;
}
