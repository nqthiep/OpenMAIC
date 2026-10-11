import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import '@openmaic/renderer/fonts.css';
import 'animate.css';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { I18nProvider } from '@/lib/hooks/use-i18n';
import { LOCALE_COOKIE, resolveRequestLocale } from '@/lib/i18n/request-locale';
import { RequestLocaleProvider } from '@/lib/i18n/request-locale-provider';
import { Toaster } from '@/components/ui/sonner';
import { AgentRegistryInit } from '@/components/agent-registry-init';
import { ModelSettingsInit } from '@/components/model-settings-init';
import { StorageHealthNotice } from '@/components/storage-health-notice';
import { AccessCodeGuard } from '@/components/access-code-guard';
import { ProSwapWatcher } from '@/components/workbench/ProSwapWatcher';
import { UserMenu } from '@/components/accounts/user-menu';
import { accountsEnabled, sessionCookieValue } from '@/lib/accounts/gate';

// The UI font is loaded from @fontsource's stylesheet rather than next/font,
// because only the stylesheet carries the per-subset `unicode-range`
// declarations. Pointing next/font at `inter-latin-wght-normal.woff2` loaded
// exactly one subset, so every character outside Latin — Cyrillic for ru-RU,
// tone-marked letters for vi-VN — fell back to an arbitrary OS font and
// rendered in a different typeface mid-word.
//
// Declaring the other subset files as sibling faces of the same family does not
// fix it either: faces with identical descriptors and no `unicode-range` do not
// fall through per glyph, so the browser simply picks one.
//
// `--font-sans` moves to globals.css since the family no longer comes from
// next/font's generated class.
import '@fontsource-variable/inter';

/**
 * Applies the dark theme before the first paint. `ThemeProvider` resolves the
 * theme (the `theme` key in localStorage, else the system preference) only
 * once the page's scripts run, so a server-rendered page would otherwise be
 * painted light and flip to dark afterwards. Keep in step with
 * `lib/hooks/use-theme.tsx`.
 */
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export const metadata: Metadata = {
  title: 'OpenMAIC',
  description:
    'The open-source AI interactive classroom. Upload a PDF to instantly generate an immersive, multi-agent learning experience.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The server cannot read the browser's language, so it picks one per request:
  // the visitor's cookie, then Accept-Language. See lib/i18n/request-locale.ts.
  const locale = resolveRequestLocale(
    (await cookies()).get(LOCALE_COOKIE)?.value,
    (await headers()).get('accept-language'),
  );
  // With accounts on (OPENMAIC_ACCOUNTS=true) the account menu is shown. It asks the
  // server who is signed in only when a session cookie is present.
  const accounts = accountsEnabled();
  const hasSessionCookie =
    accounts && sessionCookieValue(new Headers(await headers())) !== undefined;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <I18nProvider>
            <RequestLocaleProvider locale={locale}>
              <ModelSettingsInit />
              <AgentRegistryInit />
              <ProSwapWatcher />
              <AccessCodeGuard>{children}</AccessCodeGuard>
              {accounts && <UserMenu hasSessionCookie={hasSessionCookie} />}
              <Toaster position="top-center" />
              {/* After the Toaster: this one raises a toast on mount when
                  persistence is already broken, and a toast raised before its
                  host exists has nowhere to go. */}
              <StorageHealthNotice />
            </RequestLocaleProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
