/**
 * Same-origin client for the membership, sharing, class, catalog and audit routes. Every failure
 * is thrown as LearningRequestError with the server's error code. The server text is English
 * and is not shown to visitors; components map the code to a translated message.
 */

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
}

export interface AuditRow {
  id: number;
  actorId: string;
  targetId: string;
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

export function setMembershipSuspended(accountId: string, suspended: boolean): Promise<unknown> {
  return call('POST', `/api/admin/memberships/${encodeURIComponent(accountId)}`, {
    action: suspended ? 'suspend' : 'resume',
  });
}

export async function fetchShares(state: 'pending' | 'shared'): Promise<ShareRow[]> {
  const body = await call<{ shares: ShareRow[] }>('GET', `/api/admin/shares?state=${state}`);
  return body.shares;
}

export function decideShare(courseId: string, decision: 'approve' | 'reject'): Promise<unknown> {
  return call('POST', `/api/admin/shares/${encodeURIComponent(courseId)}`, { decision });
}

export async function fetchPreviews(): Promise<string[]> {
  const body = await call<{ previews: string[] }>('GET', '/api/admin/previews');
  return body.previews;
}

export function setPreview(courseId: string, on: boolean): Promise<unknown> {
  return call('POST', '/api/admin/previews', { courseId, on });
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

export async function fetchAudit(before?: number): Promise<AuditRow[]> {
  const query = before === undefined ? '' : `?before=${before}`;
  const body = await call<{ entries: AuditRow[] }>('GET', `/api/admin/audit${query}`);
  return body.entries;
}

export async function fetchCatalog(): Promise<{ courses: CatalogEntry[]; member: boolean }> {
  return call('GET', '/api/catalog');
}

export async function fetchMyClasses(): Promise<ClassRow[]> {
  const body = await call<{ classes: ClassRow[] }>('GET', '/api/classes');
  return body.classes;
}

export function joinClass(code: string): Promise<{ class: { id: string; name: string } }> {
  return call('POST', '/api/classes/join', { code });
}

export async function fetchCourseShare(
  courseId: string,
): Promise<{ owner: boolean; state: 'private' | 'pending' | 'shared' }> {
  return call('GET', `/api/courses/${encodeURIComponent(courseId)}/share`);
}

export function requestCourseShare(courseId: string): Promise<{ state: string }> {
  return call('POST', `/api/courses/${encodeURIComponent(courseId)}/share`);
}

export function withdrawCourseShare(courseId: string): Promise<unknown> {
  return call('DELETE', `/api/courses/${encodeURIComponent(courseId)}/share`);
}
