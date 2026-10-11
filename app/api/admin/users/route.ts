import type { NextRequest } from 'next/server';

import { handleCreateUser, handleListUsers } from '@/lib/accounts/admin-routes';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleListUsers(req);
}

export async function POST(req: NextRequest) {
  return handleCreateUser(req);
}
