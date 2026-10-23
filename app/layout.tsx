import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import '@openmaic/renderer/fonts.css';
import 'animate.css';
import 'katex/dist/katex.min.css';
import { DEFAULT_BRAND } from '@/lib/brand/brand-config';
import { siteJsonLd, siteOrigin } from '@/lib/brand/site-origin';
import { defaultLocale } from '@/lib/i18n/types';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { I18nProvider } from '@/lib/hooks/use-i18n';
import { Toaster } from '@/components/ui/sonner';
import { ServerProvidersInit } from '@/components/server-providers-init';
import { StorageHealthNotice } from '@/components/storage-health-notice';
import { AccessCodeGuard } from '@/components/access-code-guard';
import { ProSwapWatcher } from '@/components/workbench/ProSwapWatcher';

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
// Brand font: titles 600 to 700, text 400 to 500,
// labels and buttons 500 to 600. Static weights, each with its own latin,
// latin-ext and vietnamese subsets; Inter above stays as the named fallback.
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';

const HOME_TITLE = `${DEFAULT_BRAND.productName} · Học Toán, Tin, Lí, Hoá lớp 5, 9, 12, học đến đâu hiểu đến đó`;

export const metadata: Metadata = {
  // Absolute URL of the share image (`opengraph-image.png`) and of any other metadata asset:
  // the public origin of this deployment, the brand's domain when none is set.
  metadataBase: new URL(siteOrigin()),
  // A page that sets only its own name gets "<name> · KHAITAM", the form `useDocumentTitle` writes.
  title: {
    default: HOME_TITLE,
    template: `%s · ${DEFAULT_BRAND.productName}`,
  },
  description: DEFAULT_BRAND.description,
  openGraph: {
    title: HOME_TITLE,
    description: DEFAULT_BRAND.description,
    siteName: DEFAULT_BRAND.productName,
    type: 'website',
    locale: 'vi_VN',
  },
};

export const viewport: Viewport = {
  themeColor: DEFAULT_BRAND.themeColor,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={defaultLocale} suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteJsonLd() }} />
        <ThemeProvider>
          <I18nProvider>
            <ServerProvidersInit />
            <ProSwapWatcher />
            <AccessCodeGuard>{children}</AccessCodeGuard>
            <Toaster position="top-center" />
            {/* After the Toaster: this one raises a toast on mount when
                persistence is already broken, and a toast raised before its
                host exists has nowhere to go. */}
            <StorageHealthNotice />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
