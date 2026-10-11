import { LoginForm } from '@/components/accounts/login-form';
import { messages } from '@/components/accounts/messages';
import { AccountShell } from '@/components/accounts/shell';
import { safeNextPath } from '@/lib/accounts/gate';

/** `/login`. `next` is kept only when it is a same-site path. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(Array.isArray(next) ? next[0] : next) ?? '/';
  return (
    <AccountShell title={messages.login.title} showHomeLink={false}>
      <LoginForm next={target} />
    </AccountShell>
  );
}
