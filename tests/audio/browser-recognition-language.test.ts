/**
 * The browser-native recognition language when the user has picked none
 * (lib/hooks/use-audio-recorder.ts): the UI language, and Vietnamese while
 * i18n has no language yet. Never Chinese by default.
 */
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import { ASR_PROVIDERS } from '@/lib/audio/constants';
import { currentUiLocale, defaultASRLanguage } from '@/lib/store/settings';

const browser = ASR_PROVIDERS['browser-native'].supportedLanguages;

describe('browser-native recognition language with nothing picked', () => {
  it('is Vietnamese while i18n has no language yet', () => {
    expect(currentUiLocale()).toBe('vi-VN');
    expect(defaultASRLanguage(currentUiLocale(), browser)).toBe('vi-VN');
  });

  it('follows the UI language once i18n has one', async () => {
    await i18next.init({ lng: 'ja-JP', resources: {} });
    expect(defaultASRLanguage(currentUiLocale(), browser)).toBe('ja-JP');
  });
});
