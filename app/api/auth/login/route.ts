import type { NextRequest } from 'next/server';

import { handleLogin } from '@/lib/accounts/routes';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return handleLogin(req);
}
