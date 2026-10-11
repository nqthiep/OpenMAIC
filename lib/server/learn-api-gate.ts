import { isApiPath } from '@/lib/accounts/gate';

/**
 * The API routes a student deployment (`OPENMAIC_HOME=learn`) answers. Deny by default: an `/api/`
 * request that no rule names is refused by the proxy with a 404, so a student cannot reach course
 * generation, media, PBL, export or provider checks by calling the route directly. Pages are not gated.
 */

export type LearnApiMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface LearnApiRoute {
  readonly methods: readonly LearnApiMethod[];
  /** `:name` matches one segment; a final `*` matches one or more. */
  readonly path: string;
}

/** Open in every student deployment. */
export const LEARN_API_ROUTES: readonly LearnApiRoute[] = [
  // Health and the access code: the page needs them before anything else.
  { methods: ['GET'], path: '/api/health' },
  { methods: ['GET'], path: '/api/access-code/status' },
  { methods: ['POST'], path: '/api/access-code/verify' },

  // The lesson picker opens a lesson (a stage built on the server, no model call), and checks that a
  // lesson it remembers still exists before it reopens it.
  { methods: ['POST'], path: '/api/learn/start' },
  { methods: ['HEAD'], path: '/api/stages/:id' },

  // The classroom reads its owner facts, the settings the chat and widgets consult, and the custom agents
  // list the agent registry loads on every page. All read-only.
  { methods: ['GET'], path: '/api/stage-meta/:stageId' },
  { methods: ['GET'], path: '/api/model-config' },
  { methods: ['GET'], path: '/api/agents' },
  { methods: ['GET'], path: '/api/widgets/policy' },

  // The tutor: chat (its content filter covers these routes) and quiz grading.
  { methods: ['POST'], path: '/api/chat' },
  { methods: ['POST'], path: '/api/chat/pi' },
  { methods: ['POST'], path: '/api/chat/pi/whiteboard-visibility' },
  { methods: ['POST'], path: '/api/quiz-grade' },

  // The course document and the learner's own runtime (chat, quiz attempts, playback position), through
  // the embedded persistence endpoint. Course writes, uploads, the learner merge and store-wide deletes
  // are not listed.
  { methods: ['GET'], path: '/api/persistence/learner-key' },
  { methods: ['GET'], path: '/api/persistence/documents/:id' },
  { methods: ['GET'], path: '/api/persistence/assets/:id/content' },
  { methods: ['POST'], path: '/api/persistence/runtime/sessions' },
  { methods: ['GET', 'DELETE'], path: '/api/persistence/runtime/sessions/:id' },
  { methods: ['PATCH'], path: '/api/persistence/runtime/sessions/:id/status' },
  { methods: ['GET', 'POST'], path: '/api/persistence/runtime/sessions/:id/records' },
  {
    methods: ['GET'],
    path: '/api/persistence/runtime/stages/:stageId/learners/:learnerKey/sessions',
  },

  // The teacher's progress page is linked from the picker. Its own code (TUTOR_TEACHER_CODE) guards it.
  { methods: ['POST'], path: '/api/teacher/login' },
  { methods: ['POST'], path: '/api/teacher/logout' },
  { methods: ['GET'], path: '/api/teacher/progress' },
];

/** Open only with `OPENMAIC_ACCOUNTS` on: the account gate and each route's own checks decide the rest. */
export const LEARN_ACCOUNT_API_ROUTES: readonly LearnApiRoute[] = [
  { methods: ['POST'], path: '/api/auth/login' },
  { methods: ['POST'], path: '/api/auth/logout' },
  { methods: ['POST'], path: '/api/auth/logout-all' },
  { methods: ['GET', 'PATCH'], path: '/api/auth/me' },
  { methods: ['POST'], path: '/api/auth/password' },
  { methods: ['GET'], path: '/api/admin/audit' },
  { methods: ['GET'], path: '/api/admin/usage' },
  { methods: ['GET', 'POST'], path: '/api/admin/users' },
  { methods: ['PATCH'], path: '/api/admin/users/:id' },
  { methods: ['POST'], path: '/api/admin/users/:id/reset-password' },
];

function matchesPath(template: string, segments: readonly string[]): boolean {
  const parts = template.split('/').slice(1);
  const open = parts[parts.length - 1] === '*';
  const fixed = open ? parts.slice(0, -1) : parts;
  if (open ? segments.length <= fixed.length : segments.length !== fixed.length) return false;
  return fixed.every((part, i) => part.startsWith(':') || part === segments[i]);
}

/**
 * Whether a student deployment answers `method pathname`. Pages always pass. A HEAD request passes
 * wherever its GET does, and wherever a rule names HEAD. Pure: the proxy passes the request's
 * method and pathname and whether accounts are on. The pathname must already be percent-decoded
 * (`proxy.ts` decodes it first).
 */
export function isLearnApiAllowed(input: {
  method: string;
  pathname: string;
  accounts: boolean;
}): boolean {
  const { pathname } = input;
  if (!isApiPath(pathname)) return true;
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const segments = trimmed.split('/').slice(1);
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }
  const method = input.method.toUpperCase();
  const wanted: readonly string[] = method === 'HEAD' ? ['HEAD', 'GET'] : [method];
  const routes = input.accounts
    ? [...LEARN_API_ROUTES, ...LEARN_ACCOUNT_API_ROUTES]
    : LEARN_API_ROUTES;
  return routes.some(
    (route) => route.methods.some((m) => wanted.includes(m)) && matchesPath(route.path, segments),
  );
}
