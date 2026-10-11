import { NextRequest, NextResponse } from 'next/server';

import {
  isAgentRuntimeConfigured,
  isLearnHome,
  isProWorkbenchEnabled,
} from '@/lib/config/feature-flags';
import { verifyAccessTokenEdge } from '@/lib/server/access-token-edge';
import {
  anonymousOwnerForNavigation,
  type NavigationIdentity,
} from '@/lib/server/identity/navigation';
import { isLearnApiAllowed } from '@/lib/server/learn-api-gate';
import {
  accountsEnabled,
  gateDecision,
  routeKind,
  sessionCookieValue,
  type SessionState,
} from '@/lib/accounts/gate';

/**
 * Let the request through, carrying the anonymous owner a page request
 * establishes: the cookie is set on the page response, and the forwarded
 * request carries it too, so the page and every request it sends resolve one
 * owner (see `lib/server/identity/navigation.ts`).
 */
function next(request: NextRequest, identity: NavigationIdentity | undefined): NextResponse {
  if (!identity) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('cookie', identity.requestCookie);
  const response = NextResponse.next({ request: { headers } });
  response.headers.append('set-cookie', identity.setCookie);
  return response;
}

/** The state of the request's session, read from the database; no cookie means `none` without a query. */
async function sessionStateOf(headers: Headers): Promise<SessionState> {
  const token = sessionCookieValue(headers);
  if (token === undefined) return 'none';
  const { accountsPool } = await import('@/lib/accounts/db');
  const { resolveSession } = await import('@/lib/accounts/session');
  return (await resolveSession(await accountsPool(), token, Date.now())).state;
}

/**
 * The pathname with every segment percent-decoded: the path Next routes on. Every decision in the
 * proxy reads this one, so `/api/%74eacher/progress` meets the rules of `/api/teacher/progress`.
 * `undefined` when a segment is not valid percent-encoding.
 */
function decodedPathname(pathname: string): string | undefined {
  try {
    return pathname
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  } catch {
    return undefined;
  }
}

/**
 * The accounts gate (`OPENMAIC_ACCOUNTS=true`): a response when the request is
 * refused or redirected, `undefined` to let it through. Routes that need no
 * session never reach the database.
 */
async function accountsGate(request: NextRequest, pathname: string): Promise<Response | undefined> {
  const { search } = request.nextUrl;
  const kind = routeKind(pathname);
  const session =
    kind === 'api' || kind === 'page' ? await sessionStateOf(request.headers) : 'none';
  const decision = gateDecision({
    method: request.method,
    pathname,
    search,
    host: request.headers.get('host') ?? request.nextUrl.host,
    headers: request.headers,
    kind,
    session,
  });
  if (decision.action === 'next') return undefined;
  if (decision.action === 'redirect') {
    return NextResponse.redirect(new URL(decision.location, request.url));
  }
  if (decision.status === 404) return new NextResponse('Not found', { status: 404 });
  return NextResponse.json(
    { success: false, errorCode: decision.errorCode, error: decision.message },
    { status: decision.status },
  );
}

/**
 * Runs on the Node.js runtime (Next 16: proxy always does), so the session check
 * reads the database here, once for every route that needs a session.
 */
export async function proxy(request: NextRequest) {
  const pathname = decodedPathname(request.nextUrl.pathname);
  if (pathname === undefined) {
    return new NextResponse('Đường dẫn không hợp lệ.', { status: 400 });
  }

  // Return an actual server-side 404 when either half of the workbench is off.
  // This runs on Node, so the same check as at startup applies.
  const workbenchEnabled = isProWorkbenchEnabled() && isAgentRuntimeConfigured();
  if (!workbenchEnabled && (pathname === '/workbench' || pathname.startsWith('/workbench/'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const accounts = accountsEnabled();
  // Student deployments answer only the API routes the lesson flow uses. Any other `/api/` route is a
  // 404, the same as a route that does not exist (`lib/server/learn-api-gate.ts`).
  if (isLearnHome() && !isLearnApiAllowed({ method: request.method, pathname, accounts })) {
    return new NextResponse('Không tìm thấy.', { status: 404 });
  }
  if (accounts) {
    const refused = await accountsGate(request, pathname);
    if (refused) return refused;
  }

  // Student deployments (OPENMAIC_HOME=learn) open on the lesson picker. The course generator is
  // out of reach there, `?classic=1` included: each generation spends model budget.
  if (pathname === '/' && isLearnHome()) {
    return NextResponse.redirect(new URL('/learn', request.url));
  }

  // One anonymous owner per browser, established on the page response before
  // any API request can mint its own. With accounts on, no anonymous owner exists.
  const identity = accounts
    ? undefined
    : anonymousOwnerForNavigation({
        method: request.method,
        headers: request.headers,
        pathname,
      });

  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    return next(request, identity);
  }

  // Whitelist: access-code endpoints, health check
  if (pathname.startsWith('/api/access-code/') || pathname === '/api/health') {
    return next(request, identity);
  }

  // Check cookie — validate HMAC signature, not just existence
  const cookie = request.cookies.get('openmaic_access');
  if (cookie?.value && (await verifyAccessTokenEdge(cookie.value, accessCode))) {
    return next(request, identity);
  }

  // API requests without valid cookie → 401
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
      { status: 401 },
    );
  }

  // Page requests → let through, frontend shows modal
  return next(request, identity);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/).*)'],
};
