import type { NextRequest } from 'next/server';

import { handlePassword } from '@/lib/accounts/routes';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return handlePassword(req);
}
