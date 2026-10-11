import type { NextRequest } from 'next/server';

import { handleAudit } from '@/lib/accounts/admin-routes';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleAudit(req);
}
