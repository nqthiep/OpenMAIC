import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeaderControls } from '@/components/stage/header-controls';

// The header's dependencies are stubbed: the test is about whether the Settings
// button is rendered, not about export, theme or store behaviour.
vi.mock('@/lib/hooks/use-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/hooks/use-theme', () => ({
  useTheme: () => ({ theme: 'light', setTheme: () => {} }),
}));
vi.mock('@/lib/store', () => ({
  useStageStore: (selector: (state: unknown) => unknown) =>
    selector({ scenes: [], generatingOutlines: [], failedOutlines: [] }),
}));
vi.mock('@/lib/store/media-generation', () => ({
  useMediaGenerationStore: (selector: (state: unknown) => unknown) => selector({ tasks: {} }),
}));
vi.mock('@/lib/store/video-render', () => ({
  useVideoRenderStore: (selector: (state: unknown) => unknown) =>
    selector({ status: 'idle', percent: 0 }),
}));
vi.mock('@/lib/export/use-export-pptx', () => ({
  useExportPPTX: () => ({ exporting: false, exportPPTX: () => {}, exportResourcePack: () => {} }),
}));
vi.mock('@/lib/export/use-export-classroom', () => ({
  useExportClassroom: () => ({ exporting: false, exportClassroomZip: () => {} }),
}));
vi.mock('@/lib/export/use-export-html', () => ({
  useExportHtml: () => ({ exporting: false, exportStandaloneHtml: () => {} }),
  classroomHasPlaybackMedia: () => false,
}));
vi.mock('@/lib/export/use-export-script', () => ({
  useExportScript: () => ({
    exporting: false,
    exportScriptDocx: () => {},
    exportScriptMd: () => {},
  }),
  isScriptExportReady: () => false,
}));
vi.mock('@/components/language-switcher', () => ({ LanguageSwitcher: () => null }));
vi.mock('@/components/settings', () => ({ SettingsDialog: () => null }));
vi.mock('@/components/stage/video-export-dialog', () => ({ VideoExportDialog: () => null }));

const SETTINGS_BUTTON = 'aria-label="settings.title"';

function renderHeader(): string {
  return renderToStaticMarkup(createElement(HeaderControls));
}

describe('Settings button in the lesson header', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is offered outside a student deployment build', () => {
    vi.stubEnv('NEXT_PUBLIC_OPENMAIC_HOME', '');
    expect(renderHeader()).toContain(SETTINGS_BUTTON);
  });

  it('is not offered in a student deployment build', () => {
    vi.stubEnv('NEXT_PUBLIC_OPENMAIC_HOME', 'learn');
    expect(renderHeader()).not.toContain(SETTINGS_BUTTON);
  });
});
