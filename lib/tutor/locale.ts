/**
 * Locale of a tutor scene (SCHEMA §4): the tool's `locale` wins; otherwise this reads the stage's
 * language directive. Vietnamese diacritics or the word "Vietnamese" → vi-VN; any other text → en-US;
 * nothing to read → vi-VN (ADR 0005).
 */
export type TutorLocale = 'vi-VN' | 'en-US';

const VIETNAMESE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]|vietnamese/i;

export function resolveLocale(languageDirective?: string): TutorLocale {
  const text = languageDirective?.trim();
  if (!text) return 'vi-VN';
  return VIETNAMESE.test(text) ? 'vi-VN' : 'en-US';
}
