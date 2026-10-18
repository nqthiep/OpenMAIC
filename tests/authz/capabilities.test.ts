import { describe, expect, it } from 'vitest';

import {
  capabilitiesFor,
  singleUserCapabilities,
  type Capabilities,
} from '@/lib/server/authz/capabilities';
import type { Viewer } from '@/lib/server/authz/policy';

const GUEST: Viewer = { ownerId: 'anon:33333333-3333-4333-8333-333333333333' };
const PLAIN_LEARNER: Viewer = { accountId: 'a-plain', ownerId: 'acct:a-plain', role: 'learner' };
const MEMBER: Viewer = {
  ...PLAIN_LEARNER,
  accountId: 'a-member',
  ownerId: 'acct:a-member',
  memberActive: true,
};
const OPERATOR: Viewer = { accountId: 'a-operator', ownerId: 'acct:a-operator', role: 'operator' };
const ADMIN: Viewer = { accountId: 'a-admin', ownerId: 'acct:a-admin', role: 'admin' };

type Flag = keyof Capabilities;

/** Which roles hold each flag, in the order guest, plain learner, member, operator, administrator. */
const MATRIX: Record<Flag, [boolean, boolean, boolean, boolean, boolean]> = {
  generate: [false, false, true, true, true],
  proMode: [false, false, true, true, true],
  joinClass: [false, false, true, true, true],
  exportCourse: [false, false, true, true, true],
  shareCourse: [false, false, true, true, true],
  requestAccess: [false, true, false, false, false],
  personalProviderKey: [false, false, false, false, true],
  viewProviders: [false, false, false, true, true],
  dashboard: [false, false, false, true, true],
  viewUsage: [false, false, false, true, true],
  manageMembers: [false, false, false, true, true],
  decideShares: [false, false, false, true, true],
  markPreviews: [false, false, false, true, true],
  manageClasses: [false, false, false, true, true],
  viewAudit: [false, false, false, true, true],
  changeRoles: [false, false, false, false, true],
  disableLearners: [false, false, false, true, true],
};

const VIEWERS = [GUEST, PLAIN_LEARNER, MEMBER, OPERATOR, ADMIN] as const;

describe('capabilitiesFor: the flags each role holds', () => {
  for (const flag of Object.keys(MATRIX) as Flag[]) {
    it(`${flag}`, () => {
      const granted = VIEWERS.map((viewer) => capabilitiesFor(viewer)[flag]);
      expect(granted).toEqual(MATRIX[flag]);
    });
  }
});

describe('singleUserCapabilities: a deployment without accounts', () => {
  it('keeps generation, export and provider keys, and has none of the account features', () => {
    const flags = singleUserCapabilities();
    expect(flags).toMatchObject({
      generate: true,
      proMode: true,
      exportCourse: true,
      personalProviderKey: true,
      viewProviders: true,
      joinClass: false,
      shareCourse: false,
      requestAccess: false,
      dashboard: false,
      viewAudit: false,
      changeRoles: false,
      disableLearners: false,
    });
  });
});
