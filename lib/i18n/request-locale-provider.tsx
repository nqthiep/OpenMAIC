'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { REQUEST_LOCALE_FALLBACK } from './request-locale';
import type { Locale } from './types';

const RequestLocaleContext = createContext<Locale>(REQUEST_LOCALE_FALLBACK);

/**
 * Passes the language the server resolved for this request down the tree, so the
 * server HTML and the first client render agree. It also keeps <html lang> in step
 * with the UI language when the user changes it later.
 */
export function RequestLocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children?: ReactNode;
}) {
  const { i18n } = useTranslation();

  useEffect(() => {
    const syncLang = (language: string) => {
      document.documentElement.lang = language;
    };
    i18n.on('languageChanged', syncLang);
    return () => {
      i18n.off('languageChanged', syncLang);
    };
  }, [i18n]);

  return <RequestLocaleContext.Provider value={locale}>{children}</RequestLocaleContext.Provider>;
}

export function useRequestLocale(): Locale {
  return useContext(RequestLocaleContext);
}
