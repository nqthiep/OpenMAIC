/**
 * Provider `clip` (ARCHITECTURE §8b, ADR 0011): one slide per chapter of a pre-rendered Manim clip,
 * scripted `speech(before) → play_video → speech(after) [→ speech(ask)]`. Everything comes from the
 * catalog; never calls an LLM. Server-side only (the content hash uses node:crypto).
 */
import type { Action, Scene, SlideContent } from '@openmaic/dsl';
import { describeClip, clipNameOfScene } from '@/lib/clips/describe';
import { clipContentHash, clipElementName, parseClipName } from '@/lib/clips/name';
import type { AnyClipEntry } from '@/lib/clips/types';
import { msg } from '@/lib/tutor/catalog/messages';
import type { Messages } from '@/lib/tutor/catalog/types';
import type { BuildRequest, BuildResult, WidgetContext, WidgetProvider } from '@/lib/widgets/types';

const LOCALES = ['vi-VN', 'en-US'] as const;

export interface ClipProviderDeps {
  findClip(id: string): AnyClipEntry | undefined;
}

type Slide = SlideContent['canvas'];
type Element = Slide['elements'][number];

const THEME: Slide['theme'] = {
  backgroundColor: '#ffffff',
  themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4', '#70ad47'],
  fontColor: '#333333',
  fontName: 'Microsoft YaHei',
};

function textElement(
  id: string,
  content: string,
  top: number,
  height: number,
  size: number,
  textType: 'title' | 'notes',
): Element {
  return {
    id,
    type: 'text',
    left: 60,
    top,
    width: 880,
    height,
    rotate: 0,
    content: `<p style="text-align:center;"><span style="font-size:${size}px;">${escapeHtml(content)}</span></p>`,
    defaultFontName: 'Microsoft YaHei',
    defaultColor: '#333333',
    textType,
  } as Element;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function chapterSlide(
  entry: AnyClipEntry,
  hash: string,
  chapter: AnyClipEntry['chapters'][number],
  asset: { url: string; poster: string },
  t: (m: Messages) => string,
): SlideContent {
  const videoId = `clip-${chapter.id}-video`;
  const elements: Element[] = [
    textElement(`clip-${chapter.id}-title`, t(chapter.label), 20, 56, 32, 'title'),
    {
      id: videoId,
      type: 'video',
      left: 140,
      top: 85,
      width: 720,
      height: 405,
      rotate: 0,
      name: clipElementName(entry.id, hash, chapter.id),
      src: asset.url,
      poster: asset.poster,
      autoplay: false,
    } as Element,
  ];
  if (chapter.caption) {
    elements.push(
      textElement(`clip-${chapter.id}-caption`, t(chapter.caption), 495, 50, 20, 'notes'),
    );
  }
  return {
    type: 'slide',
    canvas: {
      id: `clip-${entry.id}-${chapter.id}`,
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: THEME,
      elements,
      background: { type: 'solid', color: '#ffffff' },
    },
  };
}

function scriptFor(
  chapter: AnyClipEntry['chapters'][number],
  videoId: string,
  prefix: string,
  t: (m: Messages) => string,
): Action[] {
  const out: Action[] = [];
  const speak = (m: Messages | undefined) => {
    const text = m ? t(m).trim() : '';
    if (text !== '') out.push({ id: `${prefix}-${out.length + 1}`, type: 'speech', text });
  };
  speak(chapter.before);
  out.push({ id: `${prefix}-${out.length + 1}`, type: 'play_video', elementId: videoId });
  speak(chapter.after);
  speak(chapter.ask);
  return out;
}

export function createClipProvider(
  deps: ClipProviderDeps,
): WidgetProvider & { isStale(scene: Scene): boolean } {
  const find = (id: string): AnyClipEntry => {
    const entry = deps.findClip(id);
    if (!entry) throw new Error(`unknown clipId "${id}"`);
    return entry;
  };

  return {
    id: 'clip',

    claimsScene: (scene) => parseClipName(clipNameOfScene(scene)) !== null,

    build(req: BuildRequest, ctx: WidgetContext): BuildResult {
      const entry = find(req.id);
      if (req.input !== undefined) throw new Error('clip input is not enabled before 3C');
      const presetId = req.presetId ?? entry.presets[0].id;
      const preset = entry.presets.find((p) => p.id === presetId);
      if (!preset) throw new Error(`unknown presetId "${presetId}" for clip "${entry.id}"`);
      const { locale } = ctx;
      const asset = entry.asset(preset.input, locale);
      if (asset === null) throw new Error('clip-not-prebuilt');
      const t = (m: Messages) => msg(m, locale);
      const hash = clipContentHash(entry, preset.input, locale);

      const content: SlideContent[] = [];
      const actions: Action[][] = [];
      for (const chapter of entry.chapters) {
        const a = asset.chapters.find((c) => c.id === chapter.id);
        if (!a) throw new Error('clip-not-prebuilt');
        content.push(chapterSlide(entry, hash, chapter, a, t));
        actions.push(
          scriptFor(chapter, `clip-${chapter.id}-video`, `clip-${entry.id}-${chapter.id}`, t),
        );
      }
      return { content, actions };
    },

    actions(scene, ctx) {
      const ref = parseClipName(clipNameOfScene(scene));
      if (!ref) throw new Error('not a clip scene');
      const entry = find(ref.clipId);
      const chapter = entry.chapters.find((c) => c.id === ref.chapterId);
      if (!chapter) return []; // the chapter is gone from the catalog: stale scene, nothing to script
      return scriptFor(chapter, `clip-${chapter.id}-video`, `clip-${entry.id}-${chapter.id}`, (m) =>
        msg(m, ctx.locale),
      );
    },

    describe: (scene) => describeClip(scene, deps),

    isStale(scene) {
      const ref = parseClipName(clipNameOfScene(scene));
      const entry = ref && deps.findClip(ref.clipId);
      if (!ref || !entry) return true;
      if (!entry.chapters.some((c) => c.id === ref.chapterId)) return true;
      // the name carries the content hash of the preset it was built from: stale if no preset still yields it
      return !entry.presets.some((p) =>
        LOCALES.some((locale) => clipContentHash(entry, p.input, locale) === ref.hash),
      );
    },
  };
}
