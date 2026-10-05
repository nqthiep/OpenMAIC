import { isWalkthroughScene } from '@/lib/widgets/policy';
import { moderate, type ModerationCategory, type ModerationVerdict } from '@/lib/tutor/moderation';
import { inventorySlide } from './course-edit/apply';
import type { Action } from '@/lib/types/action';
import type { Scene, SlideContent } from '@/lib/types/stage';

export const CONTENT_BLOCKED_HINT =
  'Generated text was blocked by the content filter. Rewrite the page without the flagged material, or retry later if the filter is unavailable.';
const CHUNK_CHARS = 4000;
const SLIDE_TEXT_TYPES = new Set(['text', 'shape', 'table']);

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
 * Student-visible text of a scene (pure): slide text/table/shape text, quiz question, options and
 * explanation, speech lines. Interactive html is skipped; walkthroughs are catalog content and trusted.
 */
export function extractVisibleText(scene: Scene): string[] {
  if (isWalkthroughScene(scene)) return [];
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
  }
  for (const action of (scene.actions ?? []) as Action[]) {
    if (action.type === 'speech') add(action.text);
  }
  return out;
}

function chunk(pieces: readonly string[]): string[] {
  const chunks: string[] = [];
  let cur = '';
  for (const piece of pieces) {
    for (let i = 0; i < piece.length; i += CHUNK_CHARS) {
      const part = piece.slice(i, i + CHUNK_CHARS);
      if (cur && cur.length + 1 + part.length > CHUNK_CHARS) {
        chunks.push(cur);
        cur = part;
      } else {
        cur = cur ? `${cur}\n${part}` : part;
      }
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
  for (const text of chunk(extractVisibleText(scene))) {
    let verdict: ModerationVerdict;
    try {
      verdict = await mod(text, ctx);
    } catch {
      verdict = { allow: false, categories: [], model: '' };
    }
    if (!verdict.allow) {
      return {
        error: 'content-blocked',
        categories: [...verdict.categories],
        hint: CONTENT_BLOCKED_HINT,
      };
    }
  }
  return null;
}
