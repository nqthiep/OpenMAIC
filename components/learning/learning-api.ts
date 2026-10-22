/**
 * Same-origin client for the membership, sharing, class, catalog and audit routes. Every failure
 * is thrown as LearningRequestError with the server's error code. The server text is English
 * and is not shown to visitors; components map the code to a translated message.
 */

import type { OpsHealth } from '@/lib/admin/ops-alerts';

export class LearningRequestError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string | undefined,
  ) {
    super(
      errorCode ? `Learning request failed: ${errorCode}` : `Learning request failed: ${status}`,
    );
    this.name = 'LearningRequestError';
  }
}

export type MembershipStatus = 'active' | 'suspended';

export interface MembershipView {
  status: MembershipStatus;
  active: boolean;
  expiresAt: string;
  monthlyQuota: number;
}

export interface MemberRow {
  id: string;
  username: string;
  membership: MembershipView | null;
}

export interface ShareRow {
  courseId: string;
  ownerId: string;
  title: string;
  state: 'pending' | 'shared';
  requestedAt: string;
  /** A shared course whose owner sent an updated version for review. */
  update?: boolean;
  /** Subject, grade and topic tags staff gave the course. */
  tags?: string[];
  /** The course this one was remixed from. */
  remixOf?: { sourceId: string; sourceTitle: string };
  /** What the course package sent with the request holds. */
  snapshot?: {
    name: string;
    sceneCount: number;
    sceneTitles: string[];
    mediaCount: number;
    bytes: number;
    submittedAt: string;
  };
}

export interface ClassRow {
  id: string;
  name: string;
  memberCount: number;
  courseIds: string[];
}

export interface CatalogEntry {
  courseId: string;
  title: string;
  kind: 'preview' | 'shared' | 'class';
  /** Absent when the server does not store course documents. */
  sceneCount?: number;
  /** When readers last got new content (ISO time); absent when unknown. */
  updatedAt?: string;
  hasQuiz?: boolean;
  hasInteractive?: boolean;
  /** Subject, grade and topic tags staff gave the course (see `lib/learning/taxonomy.ts`). */
  tags?: string[];
}

export interface AuditRow {
  id: number;
  actorId: string;
  actorName: string | null;
  targetId: string;
  targetName: string | null;
  action: string;
  reason: string | null;
  createdAt: string;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => undefined)) as
    | ({ success?: boolean; errorCode?: string } & Record<string, unknown>)
    | undefined;
  if (!response.ok || !json || json.success !== true) {
    throw new LearningRequestError(response.status, json?.errorCode);
  }
  return json as unknown as T;
}

export async function fetchMembers(
  after?: string,
): Promise<{ accounts: MemberRow[]; nextAfter: string | null }> {
  const query = after === undefined ? '' : `?after=${encodeURIComponent(after)}`;
  return call('GET', `/api/admin/memberships${query}`);
}

export function grantMembership(
  accountId: string,
  days: number,
  monthlyQuota: number,
): Promise<unknown> {
  return call('POST', `/api/admin/memberships/${encodeURIComponent(accountId)}`, {
    action: 'grant',
    days,
    monthlyQuota,
  });
}

/** Every account with its membership, all pages. */
export async function fetchAllMembers(): Promise<MemberRow[]> {
  const rows: MemberRow[] = [];
  let after: string | undefined;
  // ponytail: loads the whole list for client-side sort and filter; page on the server past a few thousand accounts.
  do {
    const page = await fetchMembers(after);
    rows.push(...page.accounts);
    after = page.nextAfter ?? undefined;
  } while (after !== undefined);
  return rows;
}

/** Sets a membership's expiry and monthly quota exactly. */
export function updateMembership(
  accountId: string,
  expiresAt: string,
  monthlyQuota: number,
): Promise<unknown> {
  return call('POST', `/api/admin/memberships/${encodeURIComponent(accountId)}`, {
    action: 'update',
    expiresAt,
    monthlyQuota,
  });
}

export function revokeMembership(accountId: string): Promise<unknown> {
  return call('POST', `/api/admin/memberships/${encodeURIComponent(accountId)}`, {
    action: 'revoke',
  });
}

export function setMembershipSuspended(accountId: string, suspended: boolean): Promise<unknown> {
  return call('POST', `/api/admin/memberships/${encodeURIComponent(accountId)}`, {
    action: suspended ? 'suspend' : 'resume',
  });
}

export async function fetchShares(state: 'pending' | 'shared'): Promise<ShareRow[]> {
  const body = await call<{ shares: ShareRow[] }>('GET', `/api/admin/shares?state=${state}`);
  return body.shares;
}

export function revokeShare(courseId: string): Promise<unknown> {
  return call('DELETE', `/api/admin/shares/${encodeURIComponent(courseId)}`);
}

export function decideShare(
  courseId: string,
  decision: 'approve' | 'reject',
  reason?: string,
): Promise<unknown> {
  return call('POST', `/api/admin/shares/${encodeURIComponent(courseId)}`, { decision, reason });
}

export interface PreviewRow {
  courseId: string;
  markedAt: string;
  /** Subject, grade and topic tags staff gave the course. */
  tags?: string[];
}

export async function fetchPreviews(): Promise<PreviewRow[]> {
  const body = await call<{ previews: PreviewRow[] }>('GET', '/api/admin/previews');
  return body.previews;
}

export function setPreview(courseId: string, on: boolean): Promise<unknown> {
  return call('POST', '/api/admin/previews', { courseId, on });
}

/** Staff: replaces the subject, grade and topic tags of a shared or preview course. */
export function setCourseTags(courseId: string, tags: readonly string[]): Promise<unknown> {
  return call('PUT', `/api/admin/courses/${encodeURIComponent(courseId)}/tags`, { tags });
}

export async function fetchClasses(): Promise<ClassRow[]> {
  const body = await call<{ classes: ClassRow[] }>('GET', '/api/admin/classes');
  return body.classes;
}

export function createClass(name: string): Promise<{ id: string; name: string; joinCode: string }> {
  return call('POST', '/api/admin/classes', { name });
}

export function attachCourse(classId: string, courseId: string): Promise<unknown> {
  return call('POST', `/api/admin/classes/${encodeURIComponent(classId)}/courses`, { courseId });
}

export function renameClass(classId: string, name: string): Promise<unknown> {
  return call('PATCH', `/api/admin/classes/${encodeURIComponent(classId)}`, { name });
}

export function deleteClass(classId: string): Promise<unknown> {
  return call('DELETE', `/api/admin/classes/${encodeURIComponent(classId)}`);
}

export function detachCourse(classId: string, courseId: string): Promise<unknown> {
  return call(
    'DELETE',
    `/api/admin/classes/${encodeURIComponent(classId)}/courses?courseId=${encodeURIComponent(courseId)}`,
  );
}

export interface CourseEntry {
  courseId: string;
  title: string;
  /** Owner's username; null for an anonymous or unrecorded owner. */
  owner: string | null;
  updatedAt: string | null;
  /** Shared, a preview, or owned by staff, so it may be attached to a class. */
  attachable: boolean;
}

/** Every course staff can open, for review and for copying its ID. */
export async function fetchCourses(): Promise<CourseEntry[]> {
  const body = await call<{ courses: CourseEntry[] }>('GET', '/api/admin/courses');
  return body.courses;
}

export interface ClassMember {
  accountId: string;
  username: string;
  joinedAt: string;
}

export async function fetchClassMembers(classId: string): Promise<ClassMember[]> {
  const body = await call<{ members: ClassMember[] }>(
    'GET',
    `/api/admin/classes/${encodeURIComponent(classId)}/members`,
  );
  return body.members;
}

/** Adds an account to a class without a join code. Staff only. */
export function addClassMember(classId: string, accountId: string): Promise<unknown> {
  return call('POST', `/api/admin/classes/${encodeURIComponent(classId)}/members`, { accountId });
}

export function removeClassMember(classId: string, accountId: string): Promise<unknown> {
  return call(
    'DELETE',
    `/api/admin/classes/${encodeURIComponent(classId)}/members?accountId=${encodeURIComponent(accountId)}`,
  );
}

/** A new join code for the class, shown once; the old one stops working. */
export function rotateJoinCode(classId: string): Promise<{ id: string; joinCode: string }> {
  return call('POST', `/api/admin/classes/${encodeURIComponent(classId)}/join-code`);
}

const AUDIT_PAGE = 200;
/** How many of the newest audit rows the log table holds. */
export const AUDIT_MAX = 1000;

/** The newest AUDIT_MAX audit rows, newest first. */
export async function fetchAudit(): Promise<AuditRow[]> {
  const rows: AuditRow[] = [];
  // ponytail: the table filters on the client, so it holds a bounded window; page on the server if older rows matter.
  while (rows.length < AUDIT_MAX) {
    const before = rows.length > 0 ? `&before=${rows[rows.length - 1]!.id}` : '';
    const body = await call<{ entries: AuditRow[] }>(
      'GET',
      `/api/admin/audit?limit=${AUDIT_PAGE}${before}`,
    );
    rows.push(...body.entries);
    if (body.entries.length < AUDIT_PAGE) break;
  }
  return rows;
}

export async function fetchCatalog(): Promise<{ courses: CatalogEntry[]; member: boolean }> {
  return call('GET', '/api/catalog');
}

/** What the operations page warns about (see `lib/admin/ops-alerts.ts`). */
export async function fetchOpsHealth(): Promise<OpsHealth> {
  const body = await call<{ health: OpsHealth }>('GET', '/api/admin/health');
  return body.health;
}

/** Kinds of provider the server can manage, in the order the overview lists them. */
export const PROVIDER_KINDS = [
  'providers',
  'tts',
  'asr',
  'pdf',
  'image',
  'video',
  'webSearch',
] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** The provider ids the server manages, by kind (`providers` is LLM). */
export async function fetchServerProviders(): Promise<Record<ProviderKind, string[]>> {
  const response = await fetch('/api/server-providers', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new LearningRequestError(response.status, undefined);
  const body = (await response.json()) as Record<string, unknown>;
  const ids = (kind: ProviderKind) => {
    const section = body[kind];
    return section && typeof section === 'object' ? Object.keys(section) : [];
  };
  return Object.fromEntries(PROVIDER_KINDS.map((kind) => [kind, ids(kind)])) as Record<
    ProviderKind,
    string[]
  >;
}

/** This month's allowance. `active` is false for anyone without an active membership. */
export interface MembershipUsage {
  readonly active: boolean;
  readonly month: string;
  readonly quota?: number;
  readonly bonus?: number;
  readonly used?: number;
}

export async function fetchMembershipUsage(): Promise<MembershipUsage> {
  return call('GET', '/api/membership/usage');
}

export type AccessRequestState = 'pending' | 'approved' | 'rejected';

/** A learner's request as an operator sees it in the queue. */
export interface PendingAccessRequestRow {
  readonly accountId: string;
  readonly username: string;
  readonly note: string | null;
  readonly requestedAt: string;
  readonly membership: 'none' | 'active' | 'expired' | 'suspended';
}

export async function fetchAccessRequests(): Promise<PendingAccessRequestRow[]> {
  const body = await call<{ requests: PendingAccessRequestRow[] }>(
    'GET',
    '/api/admin/access-requests',
  );
  return body.requests;
}

export function decideAccessRequest(
  accountId: string,
  decision: 'approve' | 'reject',
  reason?: string,
): Promise<unknown> {
  return call('POST', `/api/admin/access-requests/${encodeURIComponent(accountId)}`, {
    decision,
    ...(reason ? { reason } : {}),
  });
}

/** The learner's own request for a membership. */
export interface AccessRequestView {
  readonly state: AccessRequestState;
  readonly note: string | null;
  readonly requestedAt: string;
  readonly decidedAt: string | null;
  /** Why staff refused it, when they said. */
  readonly reason?: string | null;
}

/** The request on record (null when the learner never asked) and, after a rejection, when they may ask again. */
export async function fetchAccessRequest(): Promise<{
  request: AccessRequestView | null;
  retryAt: string | null;
}> {
  return call('GET', '/api/membership/request');
}

export async function sendAccessRequest(note?: string): Promise<{ request: AccessRequestView }> {
  return call('POST', '/api/membership/request', note === undefined ? {} : { note });
}

/** One course the learner shared, or asked to share, with how many members read it. */
export interface OwnShareRow {
  readonly courseId: string;
  readonly title: string;
  readonly state: 'pending' | 'shared' | 'rejected';
  readonly readers: number;
  /** Why a refused request was refused, when staff gave a reason. */
  readonly reason?: string | null;
  /** The subject, grade and topic tags staff gave the course. */
  readonly tags?: readonly string[];
}

/** What the learner has given and earned through shared courses. */
export interface Contribution {
  readonly shares: readonly OwnShareRow[];
  /** Distinct members who read any of their courses. */
  readonly readers: number;
  readonly bonus: { readonly month: string; readonly tokens: number; readonly cap: number };
  /** Badge codes earned. */
  readonly badges: readonly string[];
  readonly next: { readonly code: string; readonly readersNeeded: number } | null;
}

export async function fetchContribution(): Promise<Contribution> {
  const { shares, readers, bonus, badges, next } = await call<Contribution>(
    'GET',
    '/api/membership/contribution',
  );
  return { shares, readers, bonus, badges, next };
}

export async function fetchMyClasses(): Promise<ClassRow[]> {
  const body = await call<{ classes: ClassRow[] }>('GET', '/api/classes');
  return body.classes;
}

export function leaveClass(classId: string): Promise<unknown> {
  return call('DELETE', `/api/classes/${encodeURIComponent(classId)}`);
}

export function joinClass(code: string): Promise<{ class: { id: string; name: string } }> {
  return call('POST', '/api/classes/join', { code });
}

export async function fetchCourseShare(courseId: string): Promise<{
  owner: boolean;
  state: 'private' | 'pending' | 'shared' | 'rejected';
  /** Present for the owner when the last request (or update) was refused. */
  rejection?: { reason: string | null; rejectedAt: string };
  /** A shared course whose owner sent an updated version that waits for review. */
  updatePending?: boolean;
}> {
  return call('GET', `/api/courses/${encodeURIComponent(courseId)}/share`);
}

/**
 * Asks for a course to be shared, or for its shared version to be updated. With `pack` (the
 * classroom ZIP of the edited course) that version is what readers get once staff approve it.
 */
export async function requestCourseShare(
  courseId: string,
  pack?: Blob,
): Promise<{ state: string; updatePending?: boolean }> {
  if (!pack) return call('POST', `/api/courses/${encodeURIComponent(courseId)}/share`);
  const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/share`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/zip' },
    body: pack,
  });
  const json = (await response.json().catch(() => undefined)) as
    | { success?: boolean; errorCode?: string; state?: string; updatePending?: boolean }
    | undefined;
  if (!response.ok || !json || json.success !== true) {
    throw new LearningRequestError(response.status, json?.errorCode);
  }
  return { state: json.state ?? 'pending', updatePending: json.updatePending };
}

export function withdrawCourseShare(courseId: string): Promise<unknown> {
  return call('DELETE', `/api/courses/${encodeURIComponent(courseId)}/share`);
}

export interface SupportThreadRow {
  id: string;
  accountId: string;
  username: string;
  subject: string;
  state: 'open' | 'closed';
  createdAt: string;
  lastMessageAt: string;
  lastFromStaff: boolean;
  waiting: boolean;
  unread: boolean;
}

export interface SupportMessageRow {
  id: number;
  authorName: string;
  fromStaff: boolean;
  body: string;
  createdAt: string;
}

/** Support threads: the learner's own, or for staff every account's (`mine` for their own). */
export async function fetchSupportThreads(
  filter: { state?: 'open' | 'closed'; mine?: boolean } = {},
): Promise<SupportThreadRow[]> {
  const query = new URLSearchParams();
  if (filter.state) query.set('state', filter.state);
  if (filter.mine) query.set('mine', '1');
  const suffix = query.size > 0 ? `?${query}` : '';
  const body = await call<{ threads: SupportThreadRow[] }>('GET', `/api/support${suffix}`);
  return body.threads;
}

export function openSupportThread(input: {
  subject: string;
  body: string;
  username?: string;
}): Promise<{ id: string }> {
  return call('POST', '/api/support', input);
}

export function fetchSupportThread(
  id: string,
): Promise<{ thread: SupportThreadRow; messages: SupportMessageRow[]; own: boolean }> {
  return call('GET', `/api/support/${encodeURIComponent(id)}`);
}

export function replySupportThread(id: string, body: string): Promise<unknown> {
  return call('POST', `/api/support/${encodeURIComponent(id)}`, { body });
}

export function setSupportThreadState(id: string, state: 'open' | 'closed'): Promise<unknown> {
  return call('PATCH', `/api/support/${encodeURIComponent(id)}`, { state });
}

export interface QuestionRow {
  id: string;
  courseId: string;
  courseTitle: string;
  sceneId: string | null;
  sceneTitle: string | null;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  bestAnswerId: number | null;
  answerCount: number;
  /** Answers by members, without the AI answer. */
  humanAnswers: number;
  hidden: boolean;
  locked: boolean;
  createdAt: string;
  lastActivityAt: string;
}

export interface AnswerRow {
  id: number;
  authorId: string | null;
  authorName: string | null;
  fromAi: boolean;
  body: string;
  votes: number;
  voted: boolean;
  hidden: boolean;
  createdAt: string;
}

export interface QuestionDetail {
  question: QuestionRow;
  answers: AnswerRow[];
  viewer: { accountId?: string; canPost: boolean; canAccept: boolean; moderator: boolean };
}

export interface ReportRow {
  kind: 'question' | 'answer';
  targetId: string;
  questionId: string;
  questionTitle: string;
  body: string;
  authorId: string | null;
  authorName: string | null;
  hidden: boolean;
  reports: number;
  reasons: string[];
  firstReportedAt: string;
}

export type QuestionSort = 'active' | 'new' | 'top' | 'waiting';

export interface CommunityScope {
  courseId: string;
  title: string;
  total: number;
  unsolved: number;
  lastActivityAt: string;
  scenes: { sceneId: string; title: string; total: number; unsolved: number }[];
}

export function fetchQuestions(
  filter: {
    courseId?: string;
    sceneId?: string;
    mine?: boolean;
    unsolved?: boolean;
    q?: string;
    sort?: QuestionSort;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ questions: QuestionRow[]; hasMore: boolean; canPost: boolean; open?: boolean }> {
  const query = new URLSearchParams();
  if (filter.courseId) query.set('courseId', filter.courseId);
  if (filter.sceneId) query.set('sceneId', filter.sceneId);
  if (filter.mine) query.set('mine', '1');
  if (filter.unsolved) query.set('unsolved', '1');
  if (filter.q) query.set('q', filter.q);
  if (filter.sort) query.set('sort', filter.sort);
  if (filter.limit) query.set('limit', String(filter.limit));
  if (filter.offset) query.set('offset', String(filter.offset));
  const suffix = query.size > 0 ? `?${query}` : '';
  return call('GET', `/api/community/questions${suffix}`);
}

/** The courses and scenes that have questions, for the feed's scope picker. */
export function fetchCommunityScopes(): Promise<{ courses: CommunityScope[] }> {
  return call('GET', '/api/community/courses');
}

export function askQuestion(input: {
  courseId: string;
  sceneId?: string;
  title: string;
  body: string;
}): Promise<{ id: string }> {
  return call('POST', '/api/community/questions', input);
}

export function fetchQuestion(id: string): Promise<QuestionDetail> {
  return call('GET', `/api/community/questions/${encodeURIComponent(id)}`);
}

export function answerQuestion(id: string, body: string): Promise<unknown> {
  return call('POST', `/api/community/questions/${encodeURIComponent(id)}`, { body });
}

export function requestAiAnswer(id: string): Promise<{ created: boolean }> {
  return call('POST', `/api/community/questions/${encodeURIComponent(id)}/ai`);
}

export function updateQuestion(
  id: string,
  change: { bestAnswerId?: number | null; hidden?: boolean; locked?: boolean },
): Promise<{ reward: number }> {
  return call('PATCH', `/api/community/questions/${encodeURIComponent(id)}`, change);
}

export function voteAnswer(id: number): Promise<{ votes: number; voted: boolean }> {
  return call('POST', `/api/community/answers/${id}`);
}

export function setAnswerHidden(id: number, hidden: boolean): Promise<unknown> {
  return call('PATCH', `/api/community/answers/${id}`, { hidden });
}

export function reportContent(
  kind: 'question' | 'answer',
  targetId: string | number,
  reason: string,
): Promise<unknown> {
  return call('POST', '/api/community/reports', { kind, targetId, reason });
}

export async function fetchReports(): Promise<ReportRow[]> {
  return (await call<{ reports: ReportRow[] }>('GET', '/api/community/reports')).reports;
}

export function resolveReport(kind: 'question' | 'answer', targetId: string): Promise<unknown> {
  return call('PATCH', '/api/community/reports', { kind, targetId });
}

export function setCommunityBan(
  target: { accountId?: string; username?: string },
  banned: boolean,
): Promise<unknown> {
  return call('POST', '/api/community/bans', { ...target, banned });
}

export interface BanRow {
  accountId: string;
  username: string;
  reason: string | null;
  createdAt: string;
}

export async function fetchCommunityBans(): Promise<BanRow[]> {
  return (await call<{ bans: BanRow[] }>('GET', '/api/community/bans')).bans;
}

export type ChallengePhase = 'upcoming' | 'open' | 'voting' | 'finished';

export interface ChallengeRow {
  id: string;
  title: string;
  statement: string;
  referenceSolution: string;
  opensAt: string;
  closesAt: string;
  votingEndsAt: string;
  rewards: [number, number, number];
  hidden: boolean;
  phase: ChallengePhase;
  entryCount: number;
  settled: boolean;
}

export interface EntryRow {
  id: number;
  accountId: string;
  username: string;
  body: string;
  aiScore: number | null;
  aiFeedback: string | null;
  votes: number;
  voted: boolean;
  hidden: boolean;
  rank: number | null;
  reward: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderRow {
  username: string;
  points: number;
  entries: number;
  podiums: number;
}

export interface ChallengeInput {
  title: string;
  statement: string;
  referenceSolution: string;
  opensAt: string;
  submissionDays: number;
  votingDays: number;
  rewards: [number, number, number];
  hidden?: boolean;
}

export function fetchChallenges(): Promise<{
  challenges: ChallengeRow[];
  leaderboard: LeaderRow[];
  staff: boolean;
}> {
  return call('GET', '/api/community/challenges');
}

export function fetchChallenge(id: string): Promise<{
  challenge: ChallengeRow;
  entries: EntryRow[];
  viewer: { accountId?: string; canPost: boolean; staff: boolean };
}> {
  return call('GET', `/api/community/challenges/${encodeURIComponent(id)}`);
}

export function createChallenge(input: ChallengeInput): Promise<{ id: string }> {
  return call('POST', '/api/community/challenges', input);
}

export function updateChallenge(id: string, input: ChallengeInput): Promise<unknown> {
  return call('PATCH', `/api/community/challenges/${encodeURIComponent(id)}`, input);
}

export function submitEntry(
  id: string,
  body: string,
): Promise<{ id: number; graded: boolean; reason?: string }> {
  return call('POST', `/api/community/challenges/${encodeURIComponent(id)}`, { body });
}

export function voteEntry(id: number): Promise<{ votes: number; voted: boolean }> {
  return call('POST', `/api/community/challenges/entries/${id}`);
}

export function setEntryHidden(id: number, hidden: boolean): Promise<unknown> {
  return call('PATCH', `/api/community/challenges/entries/${id}`, { hidden });
}

export function fetchAppSettings(): Promise<{
  settings: Record<string, string | number>;
  /** Per setting, whether the viewer may change it. */
  changeable: Record<string, boolean>;
  /** Whether the viewer may change the administrator-only settings. */
  canChange: boolean;
}> {
  return call('GET', '/api/admin/settings');
}

export function setAppSetting(key: string, value: string | number): Promise<unknown> {
  return call('PATCH', '/api/admin/settings', { key, value });
}

export interface RemixInfo {
  remixOf: { courseId: string; title: string; author: string | null } | null;
  remixes: { courseId: string; title: string; author: string }[];
  canRemix: boolean;
  reason?: string;
}

export function fetchRemixInfo(courseId: string): Promise<RemixInfo> {
  return call('GET', `/api/courses/${encodeURIComponent(courseId)}/remix`);
}

export function recordRemix(courseId: string, sourceId: string): Promise<unknown> {
  return call('POST', `/api/courses/${encodeURIComponent(courseId)}/remix`, { sourceId });
}

/** Where the learner stopped in a course they read but did not write. */
export interface ProgressRow {
  courseId: string;
  sceneId: string;
  /** 1-based position of the scene. */
  sceneIndex: number;
  sceneCount: number;
  /** Score of the last quiz submitted in the course, 0 to 100. */
  quizScore: number | null;
  doneAt: string | null;
  updatedAt: string;
}

export interface ClassProgressRow extends ProgressRow {
  accountId: string;
}

export interface ProgressReport {
  courseId: string;
  sceneId: string;
  sceneIndex: number;
  sceneCount: number;
  quizScore?: number;
}

/** The learner's own progress: the named courses, or the ones studied last. */
export async function fetchProgress(courseIds?: readonly string[]): Promise<ProgressRow[]> {
  if (!courseIds) {
    return (await call<{ progress: ProgressRow[] }>('GET', '/api/progress')).progress;
  }
  // The route takes at most 100 ids (and ids are up to 128 characters, in a URL), so ask in
  // batches: one long list used to be refused whole, and every progress line vanished.
  const batches: string[][] = [];
  for (let at = 0; at < courseIds.length; at += PROGRESS_BATCH) {
    batches.push(courseIds.slice(at, at + PROGRESS_BATCH));
  }
  const answers = await Promise.all(
    batches.map((batch) =>
      call<{ progress: ProgressRow[] }>(
        'GET',
        `/api/progress?courseIds=${batch.map(encodeURIComponent).join(',')}`,
      ),
    ),
  );
  return answers.flatMap((answer) => answer.progress);
}

const PROGRESS_BATCH = 50;

export function putProgress(report: ProgressReport): Promise<unknown> {
  return call('PUT', '/api/progress', report);
}

/** Staff: how far each member of a class got in the courses attached to it. */
export async function fetchClassProgress(classId: string): Promise<ClassProgressRow[]> {
  const body = await call<{ progress: ClassProgressRow[] }>(
    'GET',
    `/api/admin/classes/${encodeURIComponent(classId)}/progress`,
  );
  return body.progress;
}

// ---------------------------------------------------------------------------------------------
// AI provider settings (admin). Keys go to the server and never come back: a row says only which
// secret fields are set, and the last four characters of the key.
// ---------------------------------------------------------------------------------------------

export type MasterKeyStatus = 'ok' | 'missing' | 'invalid';

export interface ProviderRow {
  section: ProviderKind;
  providerId: string;
  enabled: boolean;
  baseUrl?: string;
  models?: string[];
  has: { apiKey: boolean; accessKeyId: boolean; accessKeySecret: boolean; proxy: boolean };
  keyHint?: string;
  /** False when a key is stored but this server cannot decrypt it. */
  readable: boolean;
  /** Has what the provider needs to be served. */
  complete: boolean;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  requiresApiKey: boolean;
  keyless: boolean;
  baseUrlRequired: boolean;
  accessKeyPair: boolean;
  defaultBaseUrl?: string;
  models: { id: string; name: string }[];
}

export interface ModelRouteRow {
  stage: string;
  /** A `provider:model` string, or an object with `model` and more (api, contextWindow, thinking). */
  value: unknown;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface ProviderSettings {
  canManage: boolean;
  masterKey: MasterKeyStatus;
  rows: ProviderRow[];
  routing: ModelRouteRow[];
  stages: string[];
  catalog: Record<ProviderKind, ProviderCatalogEntry[]>;
}

export function fetchProviderSettings(): Promise<ProviderSettings> {
  return call('GET', '/api/admin/providers');
}

/** What to change on one provider. A field left out keeps its stored value; `null` clears it. */
export interface ProviderChange {
  expectedVersion: number;
  enabled?: boolean;
  baseUrl?: string | null;
  models?: string[] | null;
  secret?: {
    apiKey?: string | null;
    accessKeyId?: string | null;
    accessKeySecret?: string | null;
    proxy?: string | null;
  };
}

const providerUrl = (kind: ProviderKind, id: string) =>
  `/api/admin/providers/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`;

export function saveProvider(
  kind: ProviderKind,
  id: string,
  change: ProviderChange,
): Promise<{ row: ProviderRow }> {
  return call('PUT', providerUrl(kind, id), change);
}

export function removeProvider(kind: ProviderKind, id: string, version?: number): Promise<unknown> {
  return call(
    'DELETE',
    `${providerUrl(kind, id)}${version === undefined ? '' : `?version=${version}`}`,
  );
}

export function saveModelRoute(
  stage: string,
  value: unknown,
  expectedVersion: number,
): Promise<{ routing: ModelRouteRow[] }> {
  return call('PUT', '/api/admin/model-routing', { stage, value, expectedVersion });
}

export function removeModelRoute(
  stage: string,
  expectedVersion?: number,
): Promise<{ routing: ModelRouteRow[] }> {
  return call('DELETE', '/api/admin/model-routing', { stage, expectedVersion });
}

/**
 * Asks the server to use a saved provider once. Only the kinds that have a verify route can be
 * tried: language models, image, video and PDF. Resolves to whether it worked.
 */
export async function verifyProvider(
  kind: ProviderKind,
  id: string,
  model?: string,
): Promise<boolean> {
  const json = { 'Content-Type': 'application/json' };
  let response: Response;
  if (kind === 'providers') {
    response = await fetch('/api/verify-model', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ model: `${id}:${model ?? ''}` }),
    });
  } else if (kind === 'image' || kind === 'video') {
    response = await fetch(`/api/verify-${kind}-provider`, {
      method: 'POST',
      headers: { [`x-${kind}-provider`]: id, ...(model ? { [`x-${kind}-model`]: model } : {}) },
    });
  } else if (kind === 'pdf') {
    response = await fetch('/api/verify-pdf-provider', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ providerId: id }),
    });
  } else {
    throw new Error('This kind of provider has no connection test');
  }
  const body = (await response.json().catch(() => undefined)) as { success?: boolean } | undefined;
  return response.ok && body?.success === true;
}

/** The kinds `verifyProvider` can try. */
export const VERIFIABLE_KINDS: readonly ProviderKind[] = ['providers', 'image', 'video', 'pdf'];
