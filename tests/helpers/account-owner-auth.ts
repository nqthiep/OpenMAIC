/**
 * Registers KHAITAM's account method as the owner auth method, the way `instrumentation.ts`
 * does at boot. Call it after `vi.resetModules()` and before the first request of a test.
 */
export async function useAccountOwnerAuthentication(): Promise<void> {
  const { configureOwnerAuthentication } = await import('@/lib/server/identity');
  const { resetOwnerAuthenticationForTests } = await import('@/lib/server/identity/registry');
  const { accountSessionAuthMethod } = await import('@/lib/server/identity/host/account-session');
  resetOwnerAuthenticationForTests();
  configureOwnerAuthentication({ methods: [accountSessionAuthMethod] });
}
