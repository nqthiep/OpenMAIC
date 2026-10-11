import type { NextRequest } from 'next/server';

import { handleMe, handleUpdateMe } from '@/lib/accounts/routes';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleMe(req);
}

export async function PATCH(req: NextRequest) {
  return handleUpdateMe(req);
}
