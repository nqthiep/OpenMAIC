import { handleAccountRoleChange } from '@/lib/server/accounts/admin-handlers';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Sets the stored role of an account: `learner`, `operator` or `admin`. Administrators only. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return handleAccountRoleChange(request, id);
}
