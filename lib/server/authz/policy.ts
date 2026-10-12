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
  | 'share.request'
  | 'share.decide'
  | 'preview.mark'
  | 'membership.manage'
  | 'class.manage'
  | 'audit.read';

export interface Viewer {
  /** The signed-in account, when the request carries a live session. */
  accountId?: string;
  /** The partition the request acts under: `acct:<id>` or `anon:<uuid>`. */
  ownerId?: string;
  /** The effective role of the signed-in account. Undefined for anonymous visitors. */
  role?: AccountRole;
  /** True when the signed-in account holds an active membership. */
  memberActive?: boolean;
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
  const isOwner = resource.ownerId !== undefined && resource.ownerId === viewer.ownerId;

  switch (action) {
    case 'classroom.read':
      // A preview is open to anyone. Shared courses and class courses need an active membership.
      return (
        isStaff ||
        isOwner ||
        resource.previewed === true ||
        (viewer.memberActive === true && (resource.shared === true || resource.inClass === true))
      );
    case 'job.read':
      return isStaff || isOwner;
    case 'share.request':
      // Sharing is for a signed-in owner. An anonymous partition cannot publish.
      return isOwner && viewer.accountId !== undefined;
    case 'share.decide':
    case 'preview.mark':
    case 'membership.manage':
    case 'class.manage':
    case 'audit.read':
      return isStaff;
    case 'usage.read':
    case 'accounts.list':
      return isStaff;
    case 'accounts.disable':
      // An operator manages learners and operators. Only an administrator touches an administrator.
      return isAdmin || (isStaff && resource.targetRole !== 'admin');
    case 'accounts.role':
      return isAdmin;
    case 'spend':
      return viewer.accountId !== undefined;
    default:
      return false;
  }
}
