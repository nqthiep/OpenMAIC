'use client';

import { supportedLocales } from './locales';
import { LOCALE_COOKIE } from './request-locale';
import type { Locale } from './types';

/** Same key lib/hooks/use-i18n.tsx reads on load, so the rest of the app follows the choice too. */
const LOCALE_STORAGE_KEY = 'locale';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const CHOICES = (['vi-VN', 'en-US'] as const).flatMap((code) =>
  supportedLocales.filter((l) => l.code === code),
);

/**
 * Stores the choice for the server (cookie) and the browser (storage). The server
 * reads the cookie on the next request, so the caller reloads the page afterwards.
 */
export function saveLocaleChoice(code: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
  } catch {
    // storage blocked: the cookie alone still picks the language on the server
  }
}

/** Vietnamese / English toggle. The server renders the page again in the chosen language. */
export function LocaleSwitch({ locale }: { locale: Locale }) {
  return (
    <div className="inline-flex gap-1 rounded-md border p-0.5 text-sm">
      {CHOICES.map((choice) => {
        const active = choice.code === locale;
        return (
          <button
            key={choice.code}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (active) return;
              saveLocaleChoice(choice.code);
              window.location.reload();
            }}
            className={`rounded px-2.5 py-1 transition-colors ${
              active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
