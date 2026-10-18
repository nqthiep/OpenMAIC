'use client';

import { useEffect, type ReactNode } from 'react';
import { SiteHeader } from '@/components/home/site-shell';
import { rememberStaffLearning } from '@/lib/home/staff-learning';

/**
 * The operations dashboard gets the site top bar (logo, staff links, language, theme, account menu),
 * and opening it ends a staff member's learning-home choice for this tab.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  useEffect(() => rememberStaffLearning(false), []);

  return (
    <div className="min-h-dvh w-full bg-background">
      <SiteHeader />
      {children}
    </div>
  );
}
