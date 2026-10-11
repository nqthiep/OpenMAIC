import { redirect } from 'next/navigation';

import { AccountPanel } from '@/components/accounts/account-panel';
import { messages } from '@/components/accounts/messages';
import { AccountShell } from '@/components/accounts/shell';
import { pageSession } from '@/lib/accounts/page-session';

/** `/account`: the signed-in account's own page. */
export default async function AccountPage() {
  const session = await pageSession();
  if (session.user === undefined) redirect('/login?next=%2Faccount');
  if (session.state === 'password-change') redirect('/account/password');
  return (
    <AccountShell title={messages.account.title}>
      <AccountPanel user={session.user} />
    </AccountShell>
  );
}
