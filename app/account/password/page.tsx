import { redirect } from 'next/navigation';

import { messages } from '@/components/accounts/messages';
import { PasswordForm } from '@/components/accounts/password-form';
import { AccountShell } from '@/components/accounts/shell';
import { pageSession } from '@/lib/accounts/page-session';

/** `/account/password`. A temporary password must be replaced here before anything else. */
export default async function PasswordPage() {
  const session = await pageSession();
  if (session.user === undefined) redirect('/login?next=%2Faccount%2Fpassword');
  return (
    <AccountShell title={messages.password.title}>
      <PasswordForm mustChange={session.state === 'password-change'} />
    </AccountShell>
  );
}
