import type { NextRequest } from 'next/server';

import { handleUpdateUser } from '@/lib/accounts/admin-routes';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return handleUpdateUser(req, id);
}
