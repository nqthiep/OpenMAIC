import type { NextRequest } from 'next/server';

import { handleResetPassword } from '@/lib/accounts/admin-routes';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return handleResetPassword(req, id);
}
