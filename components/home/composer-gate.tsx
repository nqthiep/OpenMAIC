'use client';

import type { ReactNode } from 'react';
import { Gate } from '@/components/capability/gate';
import { AccessRequest } from '@/components/home/access-request';
import { QuotaLock } from '@/components/home/status-strip';
import type { MembershipStatus } from '@/lib/home/use-membership-status';

/**
 * The AI composer, or the lock in its place: the access request for a learner without a
 * membership, the allowance notice once this month's quota is used up. Shared by `/` and
 * `/workspace`, so a learner who types the workspace URL meets the same lock as on the home.
 */
export function ComposerGate({
  status,
  children,
}: {
  status: MembershipStatus;
  children: ReactNode;
}) {
  return (
    <Gate
      capability="generate"
      locked={<AccessRequest kind={status.notice.kind} />}
      blocked={status.notice.kind === 'quotaOut' ? <QuotaLock /> : undefined}
    >
      {children}
    </Gate>
  );
}
