import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The page itself is a client component, so its name for crawlers is set here.
export const metadata: Metadata = {
  title: 'Danh mục khoá học',
  description:
    'Các bài giảng tương tác Toán, Tin học, Vật lí, Hoá học cho học sinh lớp 5, lớp 9 và lớp 12. Mở bài xem thử miễn phí, không cần tài khoản.',
  alternates: { canonical: '/catalog' },
};

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return children;
}
