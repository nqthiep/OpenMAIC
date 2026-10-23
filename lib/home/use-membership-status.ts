'use client';

import { useEffect, useState } from 'react';
import type { AccountMembership } from '@/components/account/account-api';
import { fetchMembershipUsage, type MembershipUsage } from '@/components/learning/learning-api';
import { useAccountSession } from '@/lib/capabilities/use-capabilities';
import { membershipNotice, type MembershipNotice } from '@/lib/home/learner-status';

export interface MembershipStatus {
  readonly membership: AccountMembership | null;
  /** The allowance of the running cycle. Null until the server answers, and for anyone without an active membership. */
  readonly usage: MembershipUsage | null;
  readonly notice: MembershipNotice;
}

/**
 * The learner's membership as the home shows it. The home calls this once and hands the result
 * to the strip and to the composer lock, so the usage is fetched once per visit. While the usage
 * is on its way the notice has no allowance figure, so the composer shows first and locks if the
 * allowance turns out to be used up; the server refuses a generation either way.
 */
export function useMembershipStatus(): MembershipStatus {
  const session = useAccountSession();
  const membership = session?.membership ?? null;
  const username = session?.account?.username;
  const active = membership?.active === true;
  const [usage, setUsage] = useState<MembershipUsage | null>(null);

  useEffect(() => {
    if (!active) return;
    let current = true;
    fetchMembershipUsage()
      .then((next) => {
        if (current) setUsage(next);
      })
      .catch(() => {
        // Without the figures the home still works; the server checks the allowance on every use.
      });
    return () => {
      current = false;
    };
  }, [active, username]);

  return { membership, usage, notice: membershipNotice(membership, usage, new Date()) };
}
