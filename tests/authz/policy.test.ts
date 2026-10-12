import { describe, expect, it } from 'vitest';

import { can, type Action, type Viewer } from '@/lib/server/authz/policy';

const ANON: Viewer = { ownerId: 'anon:11111111-1111-4111-8111-111111111111' };
const LEARNER: Viewer = { accountId: 'a-learner', ownerId: 'acct:a-learner', role: 'learner' };
const OPERATOR: Viewer = { accountId: 'a-operator', ownerId: 'acct:a-operator', role: 'operator' };
const ADMIN: Viewer = { accountId: 'a-admin', ownerId: 'acct:a-admin', role: 'admin' };

const OWNED_BY_LEARNER = { ownerId: 'acct:a-learner' };
const OWNED_BY_OTHER = { ownerId: 'acct:someone-else' };

describe('can: reading classrooms and generation jobs', () => {
  it.each(['classroom.read', 'job.read'] as const)(
    '%s: the owner reads their own, staff read everything, others read nothing',
    (action) => {
      expect(can(LEARNER, action, OWNED_BY_LEARNER)).toBe(true);
      expect(can(LEARNER, action, OWNED_BY_OTHER)).toBe(false);
      expect(can(OPERATOR, action, OWNED_BY_OTHER)).toBe(true);
      expect(can(ADMIN, action, OWNED_BY_OTHER)).toBe(true);
      expect(can(ANON, action, OWNED_BY_LEARNER)).toBe(false);
    },
  );

  it('an anonymous owner reads only what was recorded under its own partition', () => {
    expect(can(ANON, 'classroom.read', { ownerId: ANON.ownerId })).toBe(true);
    expect(can(ANON, 'classroom.read', {})).toBe(false);
  });

  it('a resource with no recorded owner is readable by staff only', () => {
    expect(can(LEARNER, 'classroom.read', {})).toBe(false);
    expect(can(OPERATOR, 'classroom.read', {})).toBe(true);
  });
});

describe('can: staff-only reads', () => {
  it.each(['usage.read', 'accounts.list'] as const)(
    '%s: operators and administrators only',
    (action) => {
      expect(can(LEARNER, action)).toBe(false);
      expect(can(ANON, action)).toBe(false);
      expect(can(OPERATOR, action)).toBe(true);
      expect(can(ADMIN, action)).toBe(true);
    },
  );
});

describe('can: disabling accounts', () => {
  const act = (viewer: Viewer, targetRole: 'learner' | 'operator' | 'admin') =>
    can(viewer, 'accounts.disable', { targetRole });

  it('an operator disables learners and operators, never an administrator', () => {
    expect(act(OPERATOR, 'learner')).toBe(true);
    expect(act(OPERATOR, 'operator')).toBe(true);
    expect(act(OPERATOR, 'admin')).toBe(false);
  });

  it('an administrator disables any account', () => {
    expect(act(ADMIN, 'learner')).toBe(true);
    expect(act(ADMIN, 'operator')).toBe(true);
    expect(act(ADMIN, 'admin')).toBe(true);
  });

  it('a learner disables nobody', () => {
    expect(act(LEARNER, 'learner')).toBe(false);
  });
});

describe('can: changing roles and spending the operator budget', () => {
  it('only an administrator changes roles', () => {
    expect(can(ADMIN, 'accounts.role')).toBe(true);
    expect(can(OPERATOR, 'accounts.role')).toBe(false);
    expect(can(LEARNER, 'accounts.role')).toBe(false);
    expect(can(ANON, 'accounts.role')).toBe(false);
  });

  it('spending needs a signed-in account of any role', () => {
    const spend: Action = 'spend';
    expect(can(LEARNER, spend)).toBe(true);
    expect(can(OPERATOR, spend)).toBe(true);
    expect(can(ADMIN, spend)).toBe(true);
    expect(can(ANON, spend)).toBe(false);
  });
});

describe('can: course access by sharing, preview and class', () => {
  const MEMBER: Viewer = { ...LEARNER, memberActive: true };
  const LAPSED: Viewer = { ...LEARNER, memberActive: false };
  const GUEST: Viewer = { ownerId: 'anon:22222222-2222-4222-8222-222222222222' };
  const GUEST_OWNER = GUEST;

  it('a preview is open to anyone, including a guest', () => {
    expect(can(GUEST, 'classroom.read', { ownerId: 'acct:someone', previewed: true })).toBe(true);
    expect(can(LAPSED, 'classroom.read', { ownerId: 'acct:someone', previewed: true })).toBe(true);
  });

  it('a shared course opens to an active member, not to a lapsed one or a guest', () => {
    const shared = { ownerId: 'acct:someone', shared: true };
    expect(can(MEMBER, 'classroom.read', shared)).toBe(true);
    expect(can(LAPSED, 'classroom.read', shared)).toBe(false);
    expect(can(GUEST, 'classroom.read', shared)).toBe(false);
  });

  it('a class course opens to an active member of that class only', () => {
    expect(can(MEMBER, 'classroom.read', { ownerId: 'acct:x', inClass: true })).toBe(true);
    expect(can(LAPSED, 'classroom.read', { ownerId: 'acct:x', inClass: true })).toBe(false);
  });

  it('a private course stays with its owner and with staff', () => {
    expect(can(MEMBER, 'classroom.read', { ownerId: 'acct:x' })).toBe(false);
    expect(can(LEARNER, 'classroom.read', OWNED_BY_LEARNER)).toBe(true);
    expect(can(OPERATOR, 'classroom.read', { ownerId: 'acct:x' })).toBe(true);
  });

  it('only the owner requests a share; only staff decide, mark previews, manage memberships, classes and the audit log', () => {
    expect(can(LEARNER, 'share.request', OWNED_BY_LEARNER)).toBe(true);
    expect(can(LEARNER, 'share.request', OWNED_BY_OTHER)).toBe(false);
    expect(can(GUEST_OWNER, 'share.request', { ownerId: GUEST_OWNER.ownerId })).toBe(false);
    for (const action of [
      'share.decide',
      'preview.mark',
      'membership.manage',
      'class.manage',
      'audit.read',
    ] as const) {
      expect(can(LEARNER, action)).toBe(false);
      expect(can(OPERATOR, action)).toBe(true);
    }
  });
});
