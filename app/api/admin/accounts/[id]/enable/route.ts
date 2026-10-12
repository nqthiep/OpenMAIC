import { handleAccountDisabledChange } from '@/lib/server/accounts/admin-handlers';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Enables a disabled account. Sessions revoked by the disable stay revoked; the account signs in again. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return handleAccountDisabledChange(request, id, false);
}
