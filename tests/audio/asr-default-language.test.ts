import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import { ASR_PROVIDERS } from '@/lib/audio/constants';
import { defaultASRLanguage, getValidASRLanguage } from '@/lib/store/settings';

const browser = ASR_PROVIDERS['browser-native'].supportedLanguages;

describe('defaultASRLanguage', () => {
  it('picks the UI language when the provider offers it', () => {
    expect(defaultASRLanguage('vi-VN', browser)).toBe('vi-VN');
    expect(defaultASRLanguage('en-US', browser)).toBe('en-US');
    expect(defaultASRLanguage('zh-CN', browser)).toBe('zh-CN');
  });

  it('matches the primary subtag when the region is not offered', () => {
    expect(defaultASRLanguage('en-US', ['auto', 'zh', 'en'])).toBe('en');
  });

  it('falls back to the first language when the UI language is not offered', () => {
    expect(defaultASRLanguage('vi-VN', ['auto', 'zh', 'en'])).toBe('auto');
  });

  it('falls back to Vietnamese, not the first Chinese entry, when the UI language is not offered', () => {
    expect(defaultASRLanguage('xx-YY', browser)).toBe('vi-VN');
  });
});

describe('getValidASRLanguage', () => {
  it('keeps the language the user picked', () => {
    expect(getValidASRLanguage('browser-native', 'en-GB', 'vi-VN')).toBe('en-GB');
  });

  it('follows the UI language until the user picks one', () => {
    expect(getValidASRLanguage('browser-native', '', 'vi-VN')).toBe('vi-VN');
    expect(getValidASRLanguage('browser-native', undefined, 'en-US')).toBe('en-US');
  });

  it('replaces a picked language that the provider does not offer', () => {
    expect(getValidASRLanguage('funasr-asr', 'vi-VN', 'vi-VN')).toBe('auto');
  });

  it('reads the UI language from i18n when no language is passed', async () => {
    await i18next.init({ lng: 'en-US', resources: {} });
    expect(getValidASRLanguage('browser-native', '')).toBe('en-US');
  });
});
