import { supportedLocales } from './locales';

export type Locale = (typeof supportedLocales)[number]['code'];

/** Home language: used until a visitor chooses one, and for unsupported browser languages. */
export const defaultLocale: Locale = 'vi-VN';
