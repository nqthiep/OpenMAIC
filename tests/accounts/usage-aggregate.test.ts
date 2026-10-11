import { describe, expect, it } from 'vitest';

import {
  groupByAccount,
  inWindow,
  monthsBetween,
  tallyOf,
  usageWindow,
} from '@/lib/accounts/usage';
import type { UsageRecord } from '@/lib/server/usage-storage';

const USER_A = '6f1c0c4e-2b5d-4c59-9a55-0d6b1f0a9e11';
const USER_B = '0b7a3d2e-9f14-4e8a-8c1d-5e2f6a7b8c90';

function row(overrides: Partial<UsageRecord>): UsageRecord {
  return {
    id: 'row',
    createdAt: Date.UTC(2026, 9, 10, 12),
    kind: 'llm',
    source: 'chat',
    providerId: 'openai',
    modelId: 'gpt-x',
    modelString: 'openai:gpt-x',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    ...overrides,
  };
}

describe('usage grouped by account', () => {
  const records = [
    row({ ownerId: `acct_${USER_A}`, inputTokens: 100, outputTokens: 20 }),
    row({ ownerId: `acct_${USER_A}`, kind: 'image', unit: 'image', quantity: 2 }),
    row({ ownerId: `acct_${USER_B}`, inputTokens: 5, outputTokens: 1 }),
    row({ inputTokens: 7 }),
    row({ ownerId: 'anon-7f3c', inputTokens: 9 }),
    row({ ownerId: 'acct_not-a-uuid', inputTokens: 11 }),
  ];

  it('puts each account row under its account and the rest under no account', () => {
    const { byUser, unattributed } = groupByAccount(records);
    expect([...byUser.keys()].sort()).toEqual([USER_A, USER_B].sort());
    expect(byUser.get(USER_A)).toHaveLength(2);
    expect(byUser.get(USER_B)).toHaveLength(1);
    expect(unattributed.map((record) => record.inputTokens)).toEqual([7, 9, 11]);
  });

  it('adds one account up: requests, tokens, and rows per modality', () => {
    const { byUser } = groupByAccount(records);
    expect(tallyOf(byUser.get(USER_A) ?? [])).toEqual({
      requests: 2,
      inputTokens: 100,
      outputTokens: 20,
      byKind: { llm: 1, image: 1 },
    });
  });

  it('adds the unattributed rows up on their own', () => {
    const { unattributed } = groupByAccount(records);
    expect(tallyOf(unattributed)).toMatchObject({ requests: 3, inputTokens: 27, outputTokens: 0 });
  });
});

describe('the requested days', () => {
  it('reads both days inclusively, as UTC days', () => {
    const window = usageWindow(new URLSearchParams('from=2026-10-01&to=2026-10-10'));
    expect(window?.since).toBe(Date.UTC(2026, 9, 1));
    expect(window?.until).toBe(Date.UTC(2026, 9, 11));
  });

  it('leaves an absent end open', () => {
    expect(usageWindow(new URLSearchParams(''))).toEqual({
      since: undefined,
      until: undefined,
      fromDay: null,
      toDay: null,
    });
  });

  it('refuses a malformed or impossible day, and a range that runs backwards', () => {
    expect(usageWindow(new URLSearchParams('from=2026-2-1'))).toBeUndefined();
    expect(usageWindow(new URLSearchParams('to=2026-02-30'))).toBeUndefined();
    expect(usageWindow(new URLSearchParams('from=2026-10-01T00:00'))).toBeUndefined();
    expect(usageWindow(new URLSearchParams('from=2026-10-10&to=2026-10-01'))).toBeUndefined();
  });

  it('includes the last moment of the end day and nothing after it', () => {
    const window = usageWindow(new URLSearchParams('from=2026-10-01&to=2026-10-10'));
    expect(window).toBeDefined();
    const at = (createdAt: number) => inWindow(row({ createdAt }), window!);
    expect(at(Date.UTC(2026, 8, 30, 23))).toBe(false);
    expect(at(Date.UTC(2026, 9, 1))).toBe(true);
    expect(at(Date.UTC(2026, 9, 10, 23, 59, 59, 999))).toBe(true);
    expect(at(Date.UTC(2026, 9, 11))).toBe(false);
  });

  it('names every month the range touches, across a year end', () => {
    expect(monthsBetween(Date.UTC(2026, 11, 20), Date.UTC(2027, 1, 3))).toEqual([
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(monthsBetween(Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 11))).toEqual(['2026-10']);
  });
});
