'use client';

import type { ReactNode } from 'react';
import { useCapabilities } from '@/lib/capabilities/use-capabilities';
import type { Capabilities } from '@/lib/server/authz/capabilities';

/**
 * Three states. When the visitor has the capability, the children show. When not, `locked` shows
 * (a reason and what to do next), or nothing when `locked` is omitted. Nothing shows until the
 * session is known, so a locked control never flashes before the answer. `blocked` is for a
 * capability that is granted but cannot be used right now (a used-up allowance): it shows in
 * place of the children.
 */
export function Gate({
  capability,
  locked,
  blocked,
  children,
}: {
  capability: keyof Capabilities;
  locked?: ReactNode;
  blocked?: ReactNode;
  children?: ReactNode;
}) {
  const capabilities = useCapabilities();
  if (!capabilities) return null;
  if (capabilities[capability]) return <>{blocked ?? children}</>;
  return <>{locked ?? null}</>;
}
