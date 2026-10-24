import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { supportedLocales } from './locales';
import { defaultLocale } from './types';
import { loadLocaleResource } from './load-resource';

i18n
  .use(initReactI18next)
  .use(resourcesToBackend(loadLocaleResource))
  .init({
    lng: defaultLocale,
    // English, not the default locale: a key missing from a machine-drafted locale
    // should fall back to text the team reviews first. See TRANSLATION_GUIDE.md.
    fallbackLng: 'en-US',
    supportedLngs: supportedLocales.map((l) => l.code),
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
