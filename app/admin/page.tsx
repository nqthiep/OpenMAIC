import { redirect } from 'next/navigation';

import { AdminConsole } from '@/components/accounts/admin-console';
import { messages } from '@/components/accounts/messages';
import { AccountShell, ForbiddenPanel } from '@/components/accounts/shell';
import { pageSession } from '@/lib/accounts/page-session';

/** `/admin`. A signed-in user who is not an administrator is told why, on this page. */
export default async function AdminPage() {
  const session = await pageSession();
  if (session.user === undefined) redirect('/login?next=%2Fadmin');
  if (session.state === 'password-change') redirect('/account/password');
  if (session.user.role !== 'admin') {
    return (
      <AccountShell title={messages.forbidden.title}>
        <ForbiddenPanel username={session.user.username} />
      </AccountShell>
    );
  }
  return (
    <AccountShell title={messages.admin.title} wide>
      <AdminConsole actorUsername={session.user.username} />
    </AccountShell>
  );
}
