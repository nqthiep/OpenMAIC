'use client';

import { useEffect } from 'react';
import { useBrand } from '@/lib/brand/brand-context';

/**
 * Names the browser tab "<page> · <product>" while the page is mounted. The root layout sets one
 * static title, and a client-side navigation does not reset it, so the previous title is put back
 * on unmount. On a full page load Next streams its own `<title>` in after hydration and would
 * overwrite ours, so the title is re-applied whenever the head changes while the page is mounted.
 */
export function useDocumentTitle(page: string | undefined) {
  const { productName } = useBrand();
  useEffect(() => {
    const previous = document.title;
    const wanted = page ? `${page} · ${productName}` : productName;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = previous;
    };
  }, [page, productName]);
}
