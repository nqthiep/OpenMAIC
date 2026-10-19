/**
 * Language for browser speech, decided from the text itself. A lesson's language
 * is only free text (`Stage.languageDirective`), so the spoken text is the
 * reliable signal. Latin text with no Vietnamese marks is read as English.
 */
export function detectSpeechLanguage(text: string): string {
  if (/[぀-ヿ]/.test(text)) return 'ja-JP';
  if (/[가-힯]/.test(text)) return 'ko-KR';
  if (/[一-鿿㐀-䶿]/.test(text)) return 'zh-CN';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru-RU';
  if (/[؀-ۿ]/.test(text)) return 'ar-SA';
  if (/[đĐơƠưƯăĂẠ-ỹ]/.test(text)) return 'vi-VN';
  return 'en-US';
}

/**
 * A voice for `lang`: an exact language match first, then the same primary
 * subtag (`vi` matches `vi-VN` or `vi_VN`). Undefined when there is none.
 */
export function pickBrowserVoice<T extends { lang: string }>(
  voices: readonly T[],
  lang: string,
): T | undefined {
  const exact = lang.toLowerCase();
  const primary = exact.split('-')[0];
  return (
    voices.find((voice) => voice.lang.toLowerCase().replace('_', '-') === exact) ??
    voices.find((voice) => voice.lang.split(/[-_]/)[0].toLowerCase() === primary)
  );
}
