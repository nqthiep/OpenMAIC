/**
 * The single place that decides what a viewer may do. Routes gather the viewer and
 * the resource, then ask `can`. Nothing else compares roles or owners.
 *
 * Owners are partition keys: `acct:<id>` for a signed-in account, `anon:<uuid>` for a
 * browser that has only the anonymous cookie. Staff (operator, admin) see every owner.
 */
import type { AccountRole } from './roles';

export type Action =
  | 'classroom.read'
  | 'job.read'
  | 'usage.read'
  | 'accounts.list'
  | 'accounts.disable'
  | 'accounts.role'
  | 'spend'
  | 'generate'
  | 'join.class'
  | 'export.course'
  | 'share.request'
  | 'access.request'
  | 'share.decide'
  | 'preview.mark'
  | 'membership.manage'
  | 'class.manage'
  | 'audit.read'
  | 'provider.view'
  | 'provider.personalKey'
  | 'provider.manage'
  | 'dashboard.view'
  | 'support.open'
  | 'support.thread'
  | 'support.manage'
  | 'community.read'
  | 'community.post'
  | 'community.moderate'
  | 'settings.manage';

export interface Viewer {
  /** The signed-in account, when the request carries a live session. */
  accountId?: string;
  /** The partition the request acts under: `acct:<id>` or `anon:<uuid>`. */
  ownerId?: string;
  /** The effective role of the signed-in account. Undefined for anonymous visitors. */
  role?: AccountRole;
  /** True when the signed-in account holds an active membership. */
  memberActive?: boolean;
  /** True when that active membership ends soon, so its holder may already ask to renew it. */
  memberRenewable?: boolean;
}

export interface Resource {
  /** The owner the resource belongs to. Undefined when it has no recorded owner. */
  ownerId?: string;
  /** For account actions: the role of the account being acted on. */
  targetRole?: AccountRole;
  /** A course: the share state on record, if any. */
  shared?: boolean;
  /** A course: marked as a free preview by an operator. */
  previewed?: boolean;
  /** A course: attached to a class the viewer belongs to. */
  inClass?: boolean;
}

export function can(viewer: Viewer, action: Action, resource: Resource = {}): boolean {
  const isAdmin = viewer.role === 'admin';
  const isStaff = isAdmin || viewer.role === 'operator';
  const isMember = viewer.memberActive === true;
  const isOwner = resource.ownerId !== undefined && resource.ownerId === viewer.ownerId;

  switch (action) {
    case 'classroom.read':
      // A preview is open to anyone. Shared courses and class courses need an active membership.
      return (
        isStaff ||
        isOwner ||
        resource.previewed === true ||
        (isMember && (resource.shared === true || resource.inClass === true))
      );
    case 'job.read':
      return isStaff || isOwner;
    case 'share.request':
      // Sharing is for a signed-in owner with an active membership. An anonymous partition cannot publish.
      return isOwner && viewer.accountId !== undefined && (isStaff || isMember);
    case 'access.request':
      // A signed-in learner whose membership is not active may ask for one, and a member whose
      // membership ends soon may ask to renew it. Staff need none. Whether a suspended membership
      // may ask is the route's call.
      return (
        viewer.accountId !== undefined && !isStaff && (!isMember || viewer.memberRenewable === true)
      );
    case 'share.decide':
    case 'preview.mark':
    case 'membership.manage':
    case 'class.manage':
    case 'audit.read':
    case 'usage.read':
    case 'accounts.list':
    case 'provider.view':
    case 'dashboard.view':
      return isStaff;
    case 'accounts.disable':
      // An operator manages learners and operators. Only an administrator touches an administrator.
      return isAdmin || (isStaff && resource.targetRole !== 'admin');
    case 'accounts.role':
      return isAdmin;
    case 'settings.manage':
    case 'provider.manage':
      // Deployment settings, such as who pays for AI grading, and the AI providers' keys are an
      // administrator's call.
      return isAdmin;
    case 'provider.personalKey':
      // Only an administrator enters an API key of their own. Everyone else uses the server's keys.
      return isAdmin;
    case 'spend':
    case 'support.open':
      return viewer.accountId !== undefined;
    case 'support.thread':
      // A support thread belongs to the account it is about. Staff answer every thread.
      return isStaff || (viewer.accountId !== undefined && isOwner);
    case 'support.manage':
    case 'community.moderate':
      return isStaff;
    case 'community.read':
      // Every signed-in account reads the community, so a learner sees what membership brings.
      return viewer.accountId !== undefined;
    case 'community.post':
      // Asking, answering and voting are for members. Posting blocks are the route's check.
      return viewer.accountId !== undefined && (isStaff || isMember);
    case 'generate':
      // Creating a course with AI needs a signed-in account with an active membership, or staff.
      return viewer.accountId !== undefined && (isStaff || isMember);
    case 'join.class':
    case 'export.course':
      return isStaff || isMember;
    default:
      return false;
  }
}
