/**
 * Inventory of every scene write path and iframe render point (ADR 0010, Q12).
 * Inventory only: it does not check that the guard for each layer is installed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Layer = 'L2-tool' | 'L1-render-only' | 'L1-render-point' | 'L1-export' | 'not-scene';

interface Classified {
  layer: Layer;
  why: string;
}

const CLASSIFIED: Record<string, Classified> = {
  // --- L2: agent-runtime tools that write scenes/documents ---
  'lib/server/agent-runtime/walkthrough-tools.ts': {
    layer: 'L2-tool',
    why: 'walkthrough tool writes scenes',
  },
  'lib/server/agent-runtime/document-writes.ts': {
    layer: 'L2-tool',
    why: 'putSceneBringingCurrent: shared helper behind tool scene writes',
  },
  'lib/server/agent-runtime/course-edit/tools.ts': { layer: 'L2-tool', why: 'course-edit tools' },
  'lib/server/agent-runtime/curriculum-tools.ts': { layer: 'L2-tool', why: 'saveDocument' },
  'lib/server/agent-runtime/dsl-tools.ts': { layer: 'L2-tool', why: 'DSL scene tool' },
  'lib/server/agent-runtime/generate-video.ts': { layer: 'L2-tool', why: 'putScene' },
  'lib/server/agent-runtime/generation-tools.ts': { layer: 'L2-tool', why: 'generation tools' },
  'lib/server/agent-runtime/import-pptx.ts': { layer: 'L2-tool', why: 'import writes document' },
  'lib/server/agent-runtime/roster-tools.ts': { layer: 'L2-tool', why: 'saveDocument' },
  'lib/server/generation/run/document.ts': {
    layer: 'L2-tool',
    why: 'generation run writes scenes; code outlines are coerced in steps/outline and steps/scene-content (L3)',
  },
  'app/api/persistence/[...path]/route.ts': {
    layer: 'L2-tool',
    why: 'server persistence write: logs stored code widgets (ADR 0010 L2)',
  },
  'app/api/learn/start/route.ts': {
    layer: 'L2-tool',
    why: 'student door: buildLesson runs assertScenePolicy before saveDocument (ADR 0016)',
  },
  'app/api/stages/[id]/generation-complete/route.ts': {
    layer: 'not-scene',
    why: 'stage lifecycle: marks a generation run complete',
  },
  'app/api/stages/[id]/publish/route.ts': {
    layer: 'not-scene',
    why: 'stage lifecycle: publish toggle',
  },
  'app/api/stages/[id]/unpublish/route.ts': {
    layer: 'not-scene',
    why: 'stage lifecycle: unpublish toggle',
  },
  'lib/legacy-browser-import/course.ts': {
    layer: 'not-scene',
    why: 'one-way import of the legacy browser library',
  },
  'lib/video-export-app/prepare-interactive-html.ts': {
    layer: 'L1-export',
    why: 'packages interactive HTML; code HTML is replaced when codeAllowed is not true',
  },

  // --- render points of interactive HTML ---
  'components/scene-renderers/InteractiveIframeHost.tsx': {
    layer: 'L1-render-point',
    why: 'sets srcDoc of the pooled interactive iframe (upstream host)',
  },
  'components/slide-renderer/components/ThumbnailInteractive/index.tsx': {
    layer: 'L1-render-point',
    why: 'thumbnail iframe of an interactive scene; blocked code HTML is replaced before srcDoc',
  },
  'lib/standalone-player/scenes/InteractiveScene.tsx': {
    layer: 'L1-render-point',
    why: 'standalone player iframe; the export path blocks code HTML before it is packaged',
  },

  // --- export of interactive HTML ---
  'lib/export/use-export-pptx.ts': { layer: 'L1-export', why: 'inlineHtmlAssets for export' },
  'lib/export/use-export-classroom.ts': { layer: 'L1-export', why: 'inlineHtmlAssets' },
  'lib/export/inline-assets.ts': { layer: 'L1-export', why: 'defines inlineHtmlAssets' },

  // --- API routes accepting writes ---
  'app/api/stages/[id]/route.ts': { layer: 'L1-render-only', why: 'saveDocument via PUT/POST' },
  'app/api/stages/route.ts': { layer: 'L1-render-only', why: 'saveDocument via POST' },

  // --- storage plumbing / client persistence (no widget-specific logic) ---
  'lib/audio/persist-narration-reference.ts': { layer: 'not-scene', why: 'putScene, audio ref' },
  'lib/media/persist-media-reference.ts': { layer: 'not-scene', why: 'putScene, media ref' },
  'lib/document-store/migration.ts': { layer: 'not-scene', why: 'document migration' },
  'lib/document-store/plain-json-store.ts': { layer: 'not-scene', why: 'store wrapper' },
  'lib/persistence/owner-bound-document-store.ts': { layer: 'not-scene', why: 'store wrapper' },
  'lib/import/use-import-classroom.ts': { layer: 'not-scene', why: 'classroom import' },
  'lib/utils/stage-storage.ts': { layer: 'not-scene', why: 'client stage save' },
  'lib/store/interactive-iframe-pool.ts': { layer: 'not-scene', why: 'iframe pool state' },
};

/**
 * Source files under `dirs`: tracked files, plus new files not yet `git add`ed (ignored files
 * excluded). A git failure throws: it must not turn into an empty inventory.
 */
function sourceFiles(dirs: readonly string[]): string[] {
  const listed = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...dirs],
    { encoding: 'utf8' },
  );
  // A tracked file deleted from disk has no content to scan.
  return listed.split('\0').filter((file) => file !== '' && existsSync(file));
}

/** Files under `dirs` whose content matches `pattern`. */
function filesMatching(dirs: readonly string[], pattern: RegExp): string[] {
  return sourceFiles(dirs).filter((file) => pattern.test(readFileSync(file, 'utf8')));
}

function findMatches(): string[] {
  const code = filesMatching(
    ['lib', 'app', 'components'],
    /putScene\(|putSceneBringingCurrent\(|saveDocument\(|createSceneWithActions\(|srcDoc[=:]|inlineHtmlAssets\(/,
  );
  const routes = filesMatching(
    [
      'app/api/classroom',
      'app/api/persistence',
      'app/api/stages',
      'app/api/generate/scene-content',
    ],
    /export (async function|const) (PUT|POST)/,
  );
  return [...new Set([...code, ...routes])].sort();
}

// Files allowed to call generateSceneContent( (a classic code outline must be coerced before it).
const CONTENT_GENERATION_CALLERS = [
  'lib/server/generation/steps/scene-content.ts', // coerceCodeOutline on the outline first
  'lib/server/agent-runtime/generation-tools.ts', // L2: policy applied by the tool
  'lib/server/generation/run/services.ts', // the run adapter: the outline already came through steps/scene-content.ts
];

describe('generateSceneContent callers (ADR 0010 L3)', () => {
  it('only approved files call generateSceneContent(', () => {
    const callers = filesMatching(['lib', 'app', 'components'], /generateSceneContent\(/).filter(
      (f) => /\.tsx?$/.test(f),
    );
    const extra = callers.filter((f) => !CONTENT_GENERATION_CALLERS.includes(f));
    expect(
      extra,
      extra
        .map(
          (f) =>
            `${f} gọi generateSceneContent(: phải coerceCodeOutline trước, rồi thêm vào danh sách`,
        )
        .join('\n'),
    ).toEqual([]);
  });

  it('the outline and scene-content steps coerce code outlines (classic generation)', () => {
    const content = readFileSync('lib/server/generation/steps/scene-content.ts', 'utf8');
    expect(content).toContain('coerceCodeOutline({ ...input.outline })');
    const outline = readFileSync('lib/server/generation/steps/outline.ts', 'utf8');
    expect(outline).toContain('coerceCodeOutline(sanitizeNonTaskEngineOutline(enrichedBase))');
  });
});

describe('scene write-path inventory (ADR 0010)', () => {
  const found = findMatches();

  it('classifies every matching file', () => {
    const missing = found.filter((f) => !CLASSIFIED[f]);
    expect(
      missing,
      missing.map((f) => `phân loại file ${f} trong CLASSIFIED (ADR 0010)`).join('\n'),
    ).toEqual([]);
  });

  it('has no stale entries', () => {
    const stale = Object.keys(CLASSIFIED).filter((f) => !found.includes(f));
    expect(
      stale,
      stale.map((f) => `mục ${f} không còn khớp mẫu: xoá khỏi CLASSIFIED (ADR 0010)`).join('\n'),
    ).toEqual([]);
  });
});
