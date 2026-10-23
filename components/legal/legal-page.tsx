'use client';

import Link from 'next/link';
import { SiteShell } from '@/components/home/site-shell';
import { useBrand } from '@/lib/brand/brand-context';
import { useI18n } from '@/lib/hooks/use-i18n';
import { privacyEn } from '@/lib/legal/content/privacy.en';
import { privacyVi } from '@/lib/legal/content/privacy.vi';
import { termsEn } from '@/lib/legal/content/terms.en';
import { termsVi } from '@/lib/legal/content/terms.vi';
import { LEGAL_TEXT_REVIEWED, TERMS_VERSION } from '@/lib/legal/versions';
import type { LegalBlock, LegalChrome, LegalContext, LegalDocument } from '@/lib/legal/types';

type LegalVariants = Record<'vi' | 'en', (context: LegalContext) => LegalDocument>;

/**
 * The texts, by name. They are picked here, in the client module, and not passed in from a page:
 * a server component cannot hand a function to a client component.
 */
const TEXTS: Record<'terms' | 'privacy', LegalVariants> = {
  terms: { vi: termsVi, en: termsEn },
  privacy: { vi: privacyVi, en: privacyEn },
};

const CHROME: Record<'vi' | 'en', LegalChrome> = {
  vi: {
    updated: 'Phiên bản',
    contents: 'Nội dung',
    draft:
      'Bản nháp, đang chờ luật sư rà soát. Nội dung có thể thay đổi trước khi chính thức áp dụng.',
    other: 'Bản tiếng Việt là bản có giá trị áp dụng.',
    back: 'Về trang chủ',
  },
  en: {
    updated: 'Version',
    contents: 'Contents',
    draft: 'Draft, waiting for a lawyer’s review. The text may change before it takes effect.',
    other: 'This is a translation. The Vietnamese text is the one that applies.',
    back: 'Back to the home page',
  },
};

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case 'p':
      return <p className="leading-relaxed">{block.text}</p>;
    case 'ul':
      return (
        <ul className="list-disc space-y-1.5 pl-6 leading-relaxed">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="list-decimal space-y-1.5 pl-6 leading-relaxed">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead className="bg-muted/60">
              <tr>
                {block.head.map((cell) => (
                  <th key={cell} scope="col" className="px-3 py-2 font-semibold">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row[0]} className="border-t border-border align-top">
                  {row.map((cell, index) => (
                    <td key={index} className="px-3 py-2 leading-relaxed">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/**
 * A terms or policy page: the Vietnamese text for Vietnamese readers, the English one for the
 * rest. A contents list, numbered sections with anchors, and a draft notice until a lawyer has
 * reviewed the text (`LEGAL_TEXT_REVIEWED`).
 */
export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const { locale } = useI18n();
  const brand = useBrand();
  const lang = locale.startsWith('vi') ? 'vi' : 'en';
  const chrome = CHROME[lang];
  const doc = TEXTS[kind][lang]({
    product: brand.productName,
    domain: brand.domain,
    email: brand.contactEmail,
    version: TERMS_VERSION,
  });

  return (
    <SiteShell mainClassName="max-w-3xl gap-8 pb-20 pt-10 md:pt-14">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-brand-800 dark:text-white">
          {doc.title}
        </h1>
        <p className="text-muted-foreground">{doc.summary}</p>
        <p className="text-xs text-muted-foreground">
          {chrome.updated}: {TERMS_VERSION}
          {lang === 'en' ? ` · ${chrome.other}` : ''}
        </p>
        {LEGAL_TEXT_REVIEWED ? null : (
          <p
            role="note"
            className="rounded-lg border border-brand-yellow/60 bg-brand-yellow/15 px-4 py-3 text-sm text-foreground"
          >
            {chrome.draft}
          </p>
        )}
      </header>

      <nav aria-label={chrome.contents} className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">{chrome.contents}</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {doc.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="text-brand-700 hover:underline dark:text-brand-300"
              >
                {section.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-col gap-8">
        {doc.sections.map((section, index) => (
          <section key={section.id} id={section.id} className="flex scroll-mt-24 flex-col gap-3">
            <h2 className="text-xl font-semibold text-brand-800 dark:text-white">
              {index + 1}. {section.heading}
            </h2>
            {section.blocks.map((block, blockIndex) => (
              <Block key={blockIndex} block={block} />
            ))}
          </section>
        ))}
      </div>

      <p>
        <Link href="/" className="text-sm text-brand-700 hover:underline dark:text-brand-300">
          {chrome.back}
        </Link>
      </p>
    </SiteShell>
  );
}
