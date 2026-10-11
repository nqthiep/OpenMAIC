import type { NextRequest } from 'next/server';

import { handleLogout } from '@/lib/accounts/routes';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return handleLogout(req);
}
