import { promises as fs } from 'fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function withCode(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`link refused: ${code}`), { code });
}

let dir: string;

beforeEach(async () => {
  vi.resetModules();
  dir = await mkdtemp(path.join(tmpdir(), 'openmaic-links-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe('probeHardLinkSupport', () => {
  it('reports support on a normal filesystem and leaves no probe files behind', async () => {
    const { probeHardLinkSupport } = await import('@/lib/server/classroom-storage');

    await expect(probeHardLinkSupport(dir)).resolves.toBe(true);
    await expect(readdir(dir)).resolves.toEqual([]);
  });

  it('reports no support when the filesystem refuses the link, and still cleans up', async () => {
    const { probeHardLinkSupport } = await import('@/lib/server/classroom-storage');
    vi.spyOn(fs, 'link').mockRejectedValueOnce(withCode('EPERM'));

    await expect(probeHardLinkSupport(dir)).resolves.toBe(false);
    await expect(readdir(dir)).resolves.toEqual([]);
  });

  it('rethrows filesystem errors other than the link refusal', async () => {
    const { probeHardLinkSupport } = await import('@/lib/server/classroom-storage');
    vi.spyOn(fs, 'link').mockRejectedValueOnce(withCode('EIO'));

    await expect(probeHardLinkSupport(dir)).rejects.toMatchObject({ code: 'EIO' });
    await expect(readdir(dir)).resolves.toEqual([]);
  });
});

describe('writeJsonFileCreateOnly when hard links are refused', () => {
  it('rejects with the original error and logs the cause once per process', async () => {
    const { writeJsonFileCreateOnly } = await import('@/lib/server/classroom-storage');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(fs, 'link').mockRejectedValue(withCode('ENOTSUP'));
    const target = path.join(dir, 'classroom.json');

    await expect(writeJsonFileCreateOnly(target, { id: 'a' })).rejects.toMatchObject({
      code: 'ENOTSUP',
    });
    await expect(writeJsonFileCreateOnly(target, { id: 'b' })).rejects.toMatchObject({
      code: 'ENOTSUP',
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain('Hard links are not supported');
    await expect(readdir(dir)).resolves.toEqual([]);
  });
});
