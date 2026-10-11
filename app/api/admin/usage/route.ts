import type { NextRequest } from 'next/server';

import { handleAdminUsage } from '@/lib/accounts/usage';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleAdminUsage(req);
}
