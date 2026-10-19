import { describe, expect, it } from 'vitest';

import { detectSpeechLanguage, pickBrowserVoice } from '@/lib/audio/browser-speech-language';
import { resolveBrowserVoice } from '@/lib/audio/browser-tts-preview';

describe('detectSpeechLanguage', () => {
  it.each([
    ['Xin chào, hôm nay chúng ta học phân số.', 'vi-VN'],
    ['Đây là bài giảng về phân số.', 'vi-VN'],
    ['Hello there, today we learn fractions.', 'en-US'],
    ['今天我们学习分数。', 'zh-CN'],
    ['今日は分数を学びます。', 'ja-JP'],
    ['오늘은 분수를 배웁니다.', 'ko-KR'],
    ['Сегодня мы изучаем дроби.', 'ru-RU'],
    ['اليوم نتعلم الكسور', 'ar-SA'],
  ])('detects the language of %j', (text, lang) => {
    expect(detectSpeechLanguage(text)).toBe(lang);
  });
});

describe('pickBrowserVoice', () => {
  const voices = [
    { name: 'Samantha', lang: 'en-US' },
    { name: 'Linh', lang: 'vi-VN' },
  ];

  it('prefers a voice with the exact language', () => {
    expect(pickBrowserVoice(voices, 'vi-VN')?.name).toBe('Linh');
  });

  it('matches the primary language subtag, including underscore spelling', () => {
    expect(pickBrowserVoice([{ name: 'Ting', lang: 'zh_TW' }], 'zh-CN')?.name).toBe('Ting');
  });

  it('returns undefined when the browser has no voice for the language', () => {
    expect(pickBrowserVoice(voices, 'ko-KR')).toBeUndefined();
  });
});

describe('resolveBrowserVoice (settings preview)', () => {
  const voices = [
    { voiceURI: 'samantha', name: 'Samantha', lang: 'en-US' },
    { voiceURI: 'linh', name: 'Linh', lang: 'vi-VN' },
  ] as SpeechSynthesisVoice[];

  it('picks a Vietnamese voice for Vietnamese text when no voice is named', () => {
    const { voice, lang } = resolveBrowserVoice(voices, 'default', 'Xin chào các bạn.');
    expect(lang).toBe('vi-VN');
    expect(voice?.voiceURI).toBe('linh');
  });

  it('keeps a voice the user named', () => {
    const { voice, lang } = resolveBrowserVoice(voices, 'samantha', 'Xin chào các bạn.');
    expect(voice?.voiceURI).toBe('samantha');
    expect(lang).toBe('en-US');
  });
});
