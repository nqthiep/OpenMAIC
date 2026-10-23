import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Asks for a sign-in, so there is nothing for a search engine to show.
export const metadata: Metadata = {
  title: 'Cộng đồng',
  robots: { index: false, follow: false },
};

export default function CommunityLayout({ children }: { children: ReactNode }) {
  return children;
}
