import { handleAccountDisabledChange } from '@/lib/server/accounts/admin-handlers';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Disables an account. Its sessions stop resolving at once. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return handleAccountDisabledChange(request, id, true);
}
