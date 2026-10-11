import { describe, expect, it } from 'vitest';

import { getClientTranslation } from '@/lib/i18n';
import i18n from '@/lib/i18n/config';

const KEYS = [
  'transcription',
  'unsupported',
  'recognition',
  'noSpeech',
  'audioCapture',
  'notAllowed',
  'network',
  'microphone',
];
const CJK =
  /[\p{Ideographic}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}]/u;

describe('microphone error messages from useAudioRecorder', () => {
  it('reach Vietnamese users in Vietnamese, with no CJK text', async () => {
    await i18n.changeLanguage('vi-VN');
    for (const key of KEYS) {
      const text = getClientTranslation(`voice.error.${key}`);
      expect(text).not.toBe(`voice.error.${key}`);
      expect(text).not.toMatch(CJK);
    }
    expect(getClientTranslation('voice.error.other', { error: 'language-not-supported' })).toBe(
      'Lỗi nhận dạng giọng nói: language-not-supported',
    );
  });

  it('keep the wording Chinese users already had', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(getClientTranslation('voice.error.transcription')).toBe('语音识别失败，请重试');
    expect(getClientTranslation('voice.error.microphone')).toBe('无法访问麦克风，请检查权限设置');
  });
});
