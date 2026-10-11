import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readUsageRecords, recordUsage, type UsageRecordInput } from '@/lib/server/usage-storage';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-owner-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const llm: UsageRecordInput = {
  kind: 'llm',
  source: 'scene-content',
  providerId: 'openai',
  modelId: 'gpt-x',
  modelString: 'openai:gpt-x',
  usage: {
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
  },
};

describe('usage rows and the account they belong to', () => {
  it('records the account a call is made for', async () => {
    const ownerId = `acct_${randomUUID()}`;
    await recordUsage({ ...llm, ownerId }, { baseDir: dir });
    const [row] = await readUsageRecords({ baseDir: dir });
    expect(row.ownerId).toBe(ownerId);
  });

  it('does not record an owner that is not an account', async () => {
    await recordUsage({ ...llm, ownerId: 'anon-7f3c' }, { baseDir: dir });
    const [row] = await readUsageRecords({ baseDir: dir });
    expect(row).not.toHaveProperty('ownerId');
  });

  it('does not record an account owner whose id is not a UUID', async () => {
    await recordUsage({ ...llm, ownerId: 'acct_not-a-uuid' }, { baseDir: dir });
    const [row] = await readUsageRecords({ baseDir: dir });
    expect(row).not.toHaveProperty('ownerId');
  });

  it('writes the same row for a non-account owner as for no owner', async () => {
    const withoutOwner = path.join(dir, 'without');
    const withAnonymous = path.join(dir, 'with');
    await recordUsage(llm, { baseDir: withoutOwner, now: new Date('2026-10-10T00:00:00Z') });
    await recordUsage(
      { ...llm, ownerId: 'anon-7f3c' },
      { baseDir: withAnonymous, now: new Date('2026-10-10T00:00:00Z') },
    );
    const [plain] = await readUsageRecords({ baseDir: withoutOwner });
    const [anonymous] = await readUsageRecords({ baseDir: withAnonymous });
    // The ids come from a shared counter, so only the id differs between the two rows.
    expect({ ...anonymous, id: '' }).toEqual({ ...plain, id: '' });
  });
});
