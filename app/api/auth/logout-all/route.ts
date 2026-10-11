import type { NextRequest } from 'next/server';

import { handleLogoutAll } from '@/lib/accounts/routes';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return handleLogoutAll(req);
}
