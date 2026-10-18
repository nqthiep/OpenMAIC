/**
 * What a viewer may do, as booleans the interface can read. Each value is `can()` for an
 * action that needs no resource. Resource-scoped checks (this course, this account) stay on
 * the server, and the interface must not infer them from these flags.
 */
import { can, type Viewer } from './policy';

export interface Capabilities {
  /** Create a course with AI (classic generation). */
  generate: boolean;
  /** Use the Pro workbench. */
  proMode: boolean;
  /** Join a class with a code. */
  joinClass: boolean;
  /** Export a course to HTML, PPTX or ZIP. */
  exportCourse: boolean;
  /** Ask for one of your own courses to be shared. */
  shareCourse: boolean;
  /** Ask the administrators for a membership. */
  requestAccess: boolean;
  /** Enter an API key of your own in the settings. */
  personalProviderKey: boolean;
  /** See the server's provider status (read-only). */
  viewProviders: boolean;
  /** Open the operations dashboard. */
  dashboard: boolean;
  /** See deployment-wide usage. */
  viewUsage: boolean;
  /** Grant, extend, suspend or resume memberships. */
  manageMembers: boolean;
  /** Approve or reject share requests. */
  decideShares: boolean;
  /** Mark courses as free previews. */
  markPreviews: boolean;
  /** Create classes and attach courses. */
  manageClasses: boolean;
  /** Read the audit log. */
  viewAudit: boolean;
  /** Change a role. Administrators only. */
  changeRoles: boolean;
  /** Disable or enable learner accounts. */
  disableLearners: boolean;
}

export function capabilitiesFor(viewer: Viewer): Capabilities {
  return {
    generate: can(viewer, 'generate'),
    proMode: can(viewer, 'generate'),
    joinClass: can(viewer, 'join.class'),
    exportCourse: can(viewer, 'export.course'),
    // The owner is the viewer here, so this asks only whether sharing is allowed for this viewer.
    shareCourse: can(viewer, 'share.request', { ownerId: viewer.ownerId }),
    requestAccess: can(viewer, 'access.request'),
    personalProviderKey: can(viewer, 'provider.personalKey'),
    viewProviders: can(viewer, 'provider.view'),
    dashboard: can(viewer, 'dashboard.view'),
    viewUsage: can(viewer, 'usage.read'),
    manageMembers: can(viewer, 'membership.manage'),
    decideShares: can(viewer, 'share.decide'),
    markPreviews: can(viewer, 'preview.mark'),
    manageClasses: can(viewer, 'class.manage'),
    viewAudit: can(viewer, 'audit.read'),
    changeRoles: can(viewer, 'accounts.role'),
    disableLearners: can(viewer, 'accounts.disable', { targetRole: 'learner' }),
  };
}

/**
 * Capabilities for a deployment without accounts. Single-user mode keeps its own keys, its
 * generation and export, and has no membership, classes, sharing, dashboard or audit.
 */
export function singleUserCapabilities(): Capabilities {
  return {
    generate: true,
    proMode: true,
    joinClass: false,
    exportCourse: true,
    shareCourse: false,
    requestAccess: false,
    personalProviderKey: true,
    viewProviders: true,
    dashboard: false,
    viewUsage: false,
    manageMembers: false,
    decideShares: false,
    markPreviews: false,
    manageClasses: false,
    viewAudit: false,
    changeRoles: false,
    disableLearners: false,
  };
}
